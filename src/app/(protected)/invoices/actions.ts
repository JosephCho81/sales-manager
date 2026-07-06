'use server'

import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { toMessage } from '@/lib/error'
import {
  generateInvoices,
  generateCommissionInvoices,
  mapDeliveries,
  type InvoiceToCreate,
} from '@/lib/invoice-generator'
import { fetchInvoiceInputs } from './invoice-data'

/**
 * 계산서 재생성 — 입력을 반드시 서버에서 fresh 조회.
 * 클라이언트가 페이지 로드 시점 props로 생성한 rows를 받으면, 그 사이 등록된
 * 커미션이 누락된 채 전체 삭제·재삽입되어 계산서가 유실된다 (2026-07-03 사고).
 */
export async function regenerateInvoices(
  yearMonth: string,
): Promise<{ data?: unknown[] | null; error?: string }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  let inputs
  try {
    inputs = await fetchInvoiceInputs(yearMonth)
  } catch (e) {
    return { error: toMessage(e) }
  }

  const mapped = mapDeliveries(inputs.deliveries, inputs.fxRates)
  if (mapped.length === 0 && inputs.commissions.length === 0) {
    return { error: '이 달에 입고 데이터가 없거나 계약 정보가 없습니다.' }
  }

  const rows = [
    ...generateInvoices(mapped, yearMonth, inputs.monthlyDeps),
    ...generateCommissionInvoices(inputs.commissions, yearMonth),
  ]
  if (rows.length === 0) {
    return { error: '생성된 계산서가 없습니다. 등록된 품목 타입을 확인하세요.' }
  }

  return replaceInvoices(auth.user, yearMonth, rows)
}

async function replaceInvoices(user: User, yearMonth: string, rows: InvoiceToCreate[]) {
  const supabase = createAdminClient()

  // 재생성 전 지급 완료 기록 보존
  // 커미션 계산서: delivery_ids[0](커미션 레코드 ID) + to_company
  // 납품 계산서:   product_id + from_company + to_company + invoice_type
  // 조회 실패를 무시하면 기존 지급완료 기록이 재생성 시 통째로 유실됨 — 명시적 중단
  const { data: existing, error: exErr } = await supabase
    .from('invoice_instructions')
    .select('delivery_ids, product_id, from_company, to_company, invoice_type, paid_at')
    .eq('year_month', yearMonth)
    .eq('is_paid', true)
  if (exErr) return { error: `기존 지급완료 기록 조회 실패: ${exErr.message}` }

  const paidMap = new Map<string, string | null>()
  for (const ex of (existing ?? [])) {
    const dids = ex.delivery_ids as string[] | null
    // product_id === null: commissions 테이블 기반 (동국/현대) → 커미션 레코드 ID 키
    // product_id !== null: 납품 기반 커미션 (소괴탄/분탄 등) → 상품 기반 키 (안정적)
    const stableKey = ex.invoice_type === 'commission' && ex.product_id === null && dids?.[0]
      ? `c:${dids[0]}:${ex.to_company}`
      : `d:${ex.product_id}:${ex.from_company}:${ex.to_company}:${ex.invoice_type}`
    paidMap.set(stableKey, ex.paid_at)
    // 구 형식(delivery_ids[0] 기반) 키도 저장해 첫 재생성 때 유실 방지
    if (ex.invoice_type === 'commission' && ex.product_id !== null && dids?.[0]) {
      paidMap.set(`c:${dids[0]}:${ex.to_company}`, ex.paid_at)
    }
  }

  const { error: delErr } = await supabase
    .from('invoice_instructions')
    .delete()
    .eq('year_month', yearMonth)
  if (delErr) return { error: delErr.message }

  const { data, error: insErr } = await supabase
    .from('invoice_instructions')
    .insert(rows)
    .select('*')
  if (insErr) return { error: insErr.message }
  await logAudit(user, { table: 'invoice_instructions', rowId: yearMonth, action: 'update', after: { year_month: yearMonth, count: rows.length } })

  // paid_at 복원
  if (paidMap.size > 0 && data) {
    type Row = { id: string; delivery_ids: string[] | null; product_id: string | null; from_company: string; to_company: string; invoice_type: string | null }
    await Promise.all(
      (data as Row[]).flatMap(row => {
        const key = row.invoice_type === 'commission' && row.product_id === null && row.delivery_ids?.[0]
          ? `c:${row.delivery_ids[0]}:${row.to_company}`
          : `d:${row.product_id}:${row.from_company}:${row.to_company}:${row.invoice_type}`
        if (!paidMap.has(key)) return []
        return supabase
          .from('invoice_instructions')
          .update({ is_paid: true, paid_at: paidMap.get(key) })
          .eq('id', row.id)
      })
    )

    // paid_at 반영 후 최종 상태 반환
    const { data: finalData } = await supabase
      .from('invoice_instructions')
      .select('*')
      .eq('year_month', yearMonth)
      .order('created_at', { ascending: true })
    return { data: finalData }
  }

  return { data }
}

export async function updatePaidDate(id: string, paidDate: string | null) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('invoice_instructions')
    .update({ is_paid: paidDate !== null, paid_at: paidDate })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  // 0건 업데이트 = 재생성으로 이미 삭제된 행 — 조용히 성공 처리하면 지급일이
  // 사라진 것처럼 보이는 무결성 버그가 됨
  if (!data || data.length === 0) {
    return { error: '대상 계산서가 없습니다. 계산서가 재생성되었을 수 있으니 새로고침 후 다시 시도하세요.' }
  }
  await logAudit(auth.user, { table: 'invoice_instructions', rowId: id, action: 'update', after: { is_paid: paidDate !== null, paid_at: paidDate } })

  return { success: true }
}
