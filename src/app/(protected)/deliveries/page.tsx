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
    const [pResult, cResult, dResult, fxResult] = await Promise.all([
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
      // FeSi 실제 환율 (product_id + BL날짜 = delivery_date 로 매칭)
      supabase
        .from('fx_rates')
        .select('product_id, bl_date, rate_krw_per_usd'),
    ])

    if (pResult.error) fetchError = `품목: ${pResult.error.message}`
    else if (cResult.error) fetchError = `계약: ${cResult.error.message}`
    else if (dResult.error) fetchError = `입고: ${dResult.error.message}`
    else if (fxResult.error) fetchError = `환율: ${fxResult.error.message}`
    else {
      products   = (pResult.data  ?? []) as unknown as ProductRow[]
      contracts  = (cResult.data  ?? []) as unknown as ContractRow[]
      const fxMap = new Map<string, number>()
      for (const r of (fxResult.data ?? []) as Array<{ product_id: string; bl_date: string; rate_krw_per_usd: number }>) {
        fxMap.set(`${r.product_id}:${r.bl_date}`, Number(r.rate_krw_per_usd))
      }
      deliveries = ((dResult.data ?? []) as unknown as DeliveryRow[]).map(d => ({
        ...d,
        fx_rate: d.delivery_date ? (fxMap.get(`${d.product_id}:${d.delivery_date}`) ?? null) : null,
      }))
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
