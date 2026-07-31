'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { parseMonthlyDepInput, parsePaidAmount, splitShortfall } from '@/lib/depreciation'
import { regenerateInvoices } from './actions'

/**
 * 감가 변경 후 영향받는 지급월 계산서 재생성.
 * 해당 품목·납품월들의 deliveries.invoice_month를 조회해 계산서가 이미 있는 월만 재생성
 * (없으면 스킵 — 최초 생성 시 fetchInvoiceInputs가 감가를 포함하므로 자동 반영).
 *
 * 귀속월(year_month)과 매입 차감월(cost_deduct_ym)이 다를 수 있어 둘 다 넘겨야 한다.
 */
async function regenAffectedMonths(productId: string, yearMonths: string[]): Promise<string | null> {
  const targets = Array.from(new Set(yearMonths.filter(Boolean)))
  if (targets.length === 0) return null

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('deliveries')
    .select('invoice_month')
    .eq('product_id', productId)
    .in('year_month', targets)
  if (error) return `납품 조회 실패: ${error.message}`

  const months = Array.from(new Set(
    (data ?? []).map(d => d.invoice_month).filter((m): m is string => !!m)
  ))
  for (const m of months) {
    const { count, error: cErr } = await supabase
      .from('invoice_instructions')
      .select('id', { count: 'exact', head: true })
      .eq('year_month', m)
    if (cErr) return `계산서 조회 실패: ${cErr.message}`
    if (!count) continue
    const res = await regenerateInvoices(m)
    if (res.error) return `계산서 재생성 실패(${m}): ${res.error}`
  }
  return null
}

export async function upsertMonthlyDepreciation(input: {
  id?: string
  product_id: string
  year_month: string
  amount: string | number
  memo?: string | null
  sales_deduct_ym?: string | null
  cost_deduct_ym?: string | null
}): Promise<{ error?: string; success?: true }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }
  if (!input.product_id) return { error: '품목이 지정되지 않았습니다.' }
  const parsed = parseMonthlyDepInput(input)
  if (!parsed.ok) return { error: parsed.error }

  const supabase = createAdminClient()
  const row = {
    product_id: input.product_id,
    year_month: parsed.year_month,
    amount: parsed.amount,
    memo: parsed.memo,
    sales_deduct_ym: parsed.sales_deduct_ym,
    cost_deduct_ym: parsed.cost_deduct_ym,
  }
  const q = input.id
    ? supabase.from('monthly_depreciations').update(row).eq('id', input.id).select('id')
    : supabase.from('monthly_depreciations').insert(row).select('id')
  const { data, error } = await q
  if (error) {
    if (error.code === '23505') return { error: '해당 품목·월의 감가가 이미 있습니다. 기존 항목을 수정하세요.' }
    return { error: error.message }
  }
  if (!data || data.length === 0) return { error: '대상 감가가 없습니다. 새로고침 후 다시 시도하세요.' }
  await logAudit(auth.user, {
    table: 'monthly_depreciations', rowId: data[0].id,
    action: input.id ? 'update' : 'insert', after: row,
  })

  const regenErr = await regenAffectedMonths(input.product_id, [parsed.year_month, parsed.cost_deduct_ym])
  if (regenErr) return { error: `감가는 저장됐지만 ${regenErr} — 지급 일정에서 "재생성"을 눌러 주세요.` }
  return { success: true }
}

export async function deleteMonthlyDepreciation(id: string): Promise<{ error?: string; success?: true }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('monthly_depreciations')
    .delete()
    .eq('id', id)
    .select('product_id, year_month, cost_deduct_ym')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: '대상 감가가 없습니다. 새로고침 후 다시 시도하세요.' }
  await logAudit(auth.user, { table: 'monthly_depreciations', rowId: id, action: 'delete', after: null })

  const regenErr = await regenAffectedMonths(data[0].product_id, [data[0].year_month, data[0].cost_deduct_ym ?? data[0].year_month])
  if (regenErr) return { error: `감가는 삭제됐지만 ${regenErr} — 지급 일정에서 "재생성"을 눌러 주세요.` }
  return { success: true }
}

/**
 * 실입금액이 우리 시스템 계산서 총액보다 적을 때 — 차액을 감가로 기록하고 지급완료 처리.
 *
 * 현대제철은 감가를 통보 없이 반영해 역발행하므로, 감가를 모르고 저장한 매출 금액이
 * 실제 세금계산서보다 크다. 차액을 감가로 기록하면
 *   ① 매출 계산서가 실제 역발행 금액으로 재생성되고 (커미션도 함께 감액)
 *   ② cost_deduct_ym 납품월 매입(화림) 계산서에서 자동 회수된다 (커미션도 함께 복구)
 * paid_amount는 실입금 사실 자체의 기록으로 남는다.
 */
export async function recordPaymentShortfall(input: {
  invoiceId: string
  paidDate: string
  paidAmount: string | number
  /** 매입에서 회수할 납품월 */
  costDeductYM: string
  memo?: string | null
}): Promise<{ error?: string; success?: true }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()

  const { data: inv, error: iErr } = await supabase
    .from('invoice_instructions')
    .select('id, product_id, delivery_year_month, total_amount, vat_amount, from_company, to_company')
    .eq('id', input.invoiceId)
    .maybeSingle()
  if (iErr) return { error: `계산서 조회 실패: ${iErr.message}` }
  if (!inv) return { error: '대상 계산서가 없습니다. 계산서가 재생성되었을 수 있으니 새로고침 후 다시 시도하세요.' }
  if (!inv.product_id || !inv.delivery_year_month) {
    return { error: '품목·납품월이 없는 계산서(커미션 등)는 감가로 기록할 수 없습니다.' }
  }

  const total  = Number(inv.total_amount)
  const parsed = parsePaidAmount(input.paidAmount, total)
  if (!parsed.ok) return { error: parsed.error }
  if (parsed.diff === 0) {
    return { error: '차액이 없습니다. 일반 지급완료로 처리하세요.' }
  }

  // 차액 → 공급가액/부가세 역산. 부가세 규칙과 안 맞으면 감가 외 원인이므로 저장 거부
  const split = splitShortfall(parsed.diff, Number(inv.vat_amount) > 0)
  if (!split.ok) return { error: split.error }

  const depInput = parseMonthlyDepInput({
    year_month: inv.delivery_year_month,
    amount: split.supply,
    memo: input.memo ?? `${inv.from_company} 입금 차감 — 실입금 ${parsed.amount.toLocaleString('ko-KR')}원`,
    sales_deduct_ym: inv.delivery_year_month,
    cost_deduct_ym: input.costDeductYM,
  })
  if (!depInput.ok) return { error: depInput.error }
  if (depInput.cost_deduct_ym < depInput.year_month) {
    return { error: '회수 납품월은 감가 발생 납품월보다 앞설 수 없습니다.' }
  }

  const depRow = {
    product_id: inv.product_id,
    year_month: depInput.year_month,
    amount: depInput.amount,
    memo: depInput.memo,
    sales_deduct_ym: depInput.sales_deduct_ym,
    cost_deduct_ym: depInput.cost_deduct_ym,
  }
  const { data: depIns, error: depErr } = await supabase
    .from('monthly_depreciations')
    .insert(depRow)
    .select('id')
  if (depErr) {
    if (depErr.code === '23505') {
      return { error: `${depInput.year_month} 해당 품목 감가가 이미 등록돼 있습니다. 감가 패널에서 기존 항목을 확인하세요.` }
    }
    return { error: `감가 기록 실패: ${depErr.message}` }
  }
  const depId = depIns![0].id

  const { data: updated, error: uErr } = await supabase
    .from('invoice_instructions')
    .update({ is_paid: true, paid_at: input.paidDate, paid_amount: parsed.amount })
    .eq('id', input.invoiceId)
    .select('id')
  if (uErr || !updated || updated.length === 0) {
    // 트랜잭션이 없으므로 감가만 남는 상태를 방지 — 보상 삭제
    await supabase.from('monthly_depreciations').delete().eq('id', depId)
    return { error: `실입금액 저장 실패: ${uErr?.message ?? '대상 계산서가 없습니다.'} — 감가 기록도 취소했습니다.` }
  }

  await logAudit(auth.user, { table: 'monthly_depreciations', rowId: depId, action: 'insert', after: depRow })
  await logAudit(auth.user, {
    table: 'invoice_instructions', rowId: input.invoiceId, action: 'update',
    after: { is_paid: true, paid_at: input.paidDate, paid_amount: parsed.amount },
  })

  const regenErr = await regenAffectedMonths(inv.product_id, [depInput.year_month, depInput.cost_deduct_ym])
  if (regenErr) return { error: `기록은 저장됐지만 ${regenErr} — 지급 일정에서 "재생성"을 눌러 주세요.` }
  return { success: true }
}

export async function setDepreciationSettled(id: string, settled: boolean): Promise<{ error?: string; success?: true }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  // 정산완료는 계산서 금액에 영향 없음 — 재생성 불필요
  const settled_at = settled ? new Date().toISOString() : null
  const { data, error } = await supabase
    .from('monthly_depreciations')
    .update({ settled_at })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: '대상 감가가 없습니다. 새로고침 후 다시 시도하세요.' }
  await logAudit(auth.user, { table: 'monthly_depreciations', rowId: id, action: 'update', after: { settled_at } })
  return { success: true }
}
