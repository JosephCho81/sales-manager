'use server'

import { createAdminClient } from '@/lib/supabase/server'

const DELIVERY_SELECT = `
  id, year_month, invoice_month, delivery_date, product_id, contract_id,
  quantity_kg, addl_quantity_kg, addl_margin_per_ton,
  hoejin_shortage_kg, hoejin_shortage_price, depreciation_kg,
  memo, created_at,
  product:products(id, display_name, buyer),
  contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate, start_date, end_date)
`

export async function upsertDelivery(payload: Record<string, unknown>, editId?: string) {
  const supabase = createAdminClient()

  if (editId) {
    const { data, error } = await supabase
      .from('deliveries')
      .update(payload)
      .eq('id', editId)
      .select(DELIVERY_SELECT)
      .single()
    if (error) return { error: error.message }
    return { data }
  } else {
    const { data, error } = await supabase
      .from('deliveries')
      .insert(payload)
      .select(DELIVERY_SELECT)
      .single()
    if (error) return { error: error.message }
    return { data }
  }
}

export async function upsertFxRate(productId: string, blDate: string, rate: number) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('fx_rates').upsert(
    { product_id: productId, bl_date: blDate, rate_krw_per_usd: rate, memo: '입고 등록 시 입력' },
    { onConflict: 'product_id,bl_date' }
  )
  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteDelivery(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('deliveries').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}
