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
    const key = ex.invoice_type === 'commission' && dids?.[0]
      ? `c:${dids[0]}:${ex.to_company}`
      : `d:${ex.product_id}:${ex.from_company}:${ex.to_company}:${ex.invoice_type}`
    paidMap.set(key, ex.paid_at)
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
        const key = row.invoice_type === 'commission' && row.delivery_ids?.[0]
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
