'use server'

import { createAdminClient } from '@/lib/supabase/server'
import type { InvoiceToCreate } from '@/lib/invoice-generator'

export async function replaceInvoices(yearMonth: string, rows: InvoiceToCreate[]) {
  const supabase = createAdminClient()

  // 재생성 전 지급 완료 기록 보존
  // 커미션 계산서: delivery_ids[0](커미션 레코드 ID) + to_company
  // 납품 계산서:   product_id + from_company + to_company + invoice_type
  const { data: existing } = await supabase
    .from('invoice_instructions')
    .select('delivery_ids, product_id, from_company, to_company, invoice_type, paid_at')
    .eq('year_month', yearMonth)
    .eq('is_paid', true)

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
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('invoice_instructions')
    .update({ is_paid: paidDate !== null, paid_at: paidDate })
    .eq('id', id)
  if (error) return { error: error.message }

  return { success: true }
}
