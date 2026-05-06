import { toMessage } from '@/lib/error'
import FetchErrorView from '@/components/FetchErrorView'
import { createAdminClient } from '@/lib/supabase/server'
import DeliveriesClient from './DeliveriesClient'
import type { ProductRow, ContractRow, DeliveryRow } from './types'

export const dynamic = 'force-dynamic'

export default async function DeliveriesPage() {
  let products: ProductRow[] = []
  let contracts: ContractRow[] = []
  let deliveries: DeliveryRow[] = []
  let fetchError: string | null = null

  try {
    const supabase = createAdminClient()
    const [pResult, cResult, dResult] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, display_name, buyer, price_unit, is_active')
        .eq('is_active', true)
        .order('display_name'),
      supabase
        .from('contracts')
        .select('id, product_id, start_date, end_date, sell_price, cost_price, currency, reference_exchange_rate, invoice_month_offset')
        .order('start_date', { ascending: false }),
      supabase
        .from('deliveries')
        .select(`
          id, year_month, invoice_month, delivery_date, product_id, contract_id,
          quantity_kg, depreciation_amount,
          memo, created_at,
          product:products(id, display_name, buyer),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate, start_date, end_date)
        `)
        .order('year_month', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    if (pResult.error) fetchError = `품목: ${pResult.error.message}`
    else if (cResult.error) fetchError = `계약: ${cResult.error.message}`
    else if (dResult.error) fetchError = `입고: ${dResult.error.message}`
    else {
      products   = (pResult.data  ?? []) as unknown as ProductRow[]
      contracts  = (cResult.data  ?? []) as unknown as ContractRow[]
      deliveries = (dResult.data  ?? []) as unknown as DeliveryRow[]
    }
  } catch (e) {
    fetchError = toMessage(e)
  }

  if (fetchError) return <FetchErrorView message={fetchError} hint="Supabase 마이그레이션 실행 여부를 확인하세요." />

  return (
    <DeliveriesClient
      products={products}
      contracts={contracts}
      initialDeliveries={deliveries}
    />
  )
}
