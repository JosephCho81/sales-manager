'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { STALE_WRITE_ERROR, type EditTarget } from '@/lib/optimistic'
import { legacyDeliveryDepAllowed } from '@/lib/depreciation'

const DELIVERY_SELECT = `
  id, year_month, invoice_month, delivery_date, product_id, contract_id,
  quantity_kg, depreciation_amount,
  memo, created_at, updated_at,
  product:products(id, display_name, buyer),
  contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate, start_date, end_date)
`

export async function upsertDelivery(payload: Record<string, unknown>, edit?: EditTarget) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()

  let currentDep: number | null = null
  if (edit) {
    const { data: cur, error: curErr } = await supabase
      .from('deliveries').select('depreciation_amount').eq('id', edit.id).maybeSingle()
    if (curErr) return { error: curErr.message }
    currentDep = cur?.depreciation_amount ?? null
  }
  if (!legacyDeliveryDepAllowed(payload.depreciation_amount, currentDep)) {
    return { error: '입고 건별 감가는 더 이상 받지 않습니다. 결제 일정의 감가 패널에서 입력하세요.' }
  }

  if (edit) {
    const { data, error } = await supabase
      .from('deliveries')
      .update(payload)
      .eq('id', edit.id)
      .eq('updated_at', edit.updatedAt)
      .select(DELIVERY_SELECT)
    if (error) return { error: error.message }
    if (!data || data.length === 0) return { error: STALE_WRITE_ERROR }
    await logAudit(auth.user, { table: 'deliveries', rowId: edit.id, action: 'update', after: payload })
    return { data: data[0] }
  } else {
    const { data, error } = await supabase
      .from('deliveries')
      .insert(payload)
      .select(DELIVERY_SELECT)
      .single()
    if (error) return { error: error.message }
    await logAudit(auth.user, { table: 'deliveries', rowId: (data as { id: string }).id, action: 'insert', after: payload })
    return { data }
  }
}

export async function upsertFxRate(productId: string, blDate: string, rate: number) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { error } = await supabase.from('fx_rates').upsert(
    { product_id: productId, bl_date: blDate, rate_krw_per_usd: rate, memo: '입고 등록 시 입력' },
    { onConflict: 'product_id,bl_date' }
  )
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'fx_rates', rowId: `${productId}:${blDate}`, action: 'update', after: { product_id: productId, bl_date: blDate, rate_krw_per_usd: rate } })
  return { success: true }
}

export async function deleteDelivery(id: string) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data: before } = await supabase.from('deliveries').select('*').eq('id', id).single()
  const { error } = await supabase.from('deliveries').delete().eq('id', id)
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'deliveries', rowId: id, action: 'delete', before })
  return { success: true }
}
