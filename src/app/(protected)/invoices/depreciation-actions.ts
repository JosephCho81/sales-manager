'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { parseMonthlyDepInput } from '@/lib/depreciation'
import { regenerateInvoices } from './actions'

/**
 * 감가 변경 후 영향받는 지급월 계산서 재생성.
 * 해당 품목·납품월의 deliveries.invoice_month를 조회해 계산서가 이미 있는 월만 재생성
 * (없으면 스킵 — 최초 생성 시 fetchInvoiceInputs가 감가를 포함하므로 자동 반영).
 */
async function regenAffectedMonths(productId: string, yearMonth: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('deliveries')
    .select('invoice_month')
    .eq('product_id', productId)
    .eq('year_month', yearMonth)
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

  const regenErr = await regenAffectedMonths(input.product_id, parsed.year_month)
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
    .select('product_id, year_month')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: '대상 감가가 없습니다. 새로고침 후 다시 시도하세요.' }
  await logAudit(auth.user, { table: 'monthly_depreciations', rowId: id, action: 'delete', after: null })

  const regenErr = await regenAffectedMonths(data[0].product_id, data[0].year_month)
  if (regenErr) return { error: `감가는 삭제됐지만 ${regenErr} — 지급 일정에서 "재생성"을 눌러 주세요.` }
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
