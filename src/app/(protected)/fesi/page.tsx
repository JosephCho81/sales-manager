import { createClient } from '@/lib/supabase/server'
import FeSiClient from './FeSiClient'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ month?: string }>

export default async function FeSiPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const now = new Date()
  const yearMonth =
    params.month ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fesiDeliveries: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fxRates: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fesiProducts: any[] = []
  let fetchError: string | null = null

  try {
    const supabase = await createClient()

    const [pRes, dRes, rRes] = await Promise.all([
      // FeSi 품목 목록
      supabase
        .from('products')
        .select('id, name, display_name')
        .in('name', ['FESI75', 'FESI60']),

      // FeSi 입고 데이터 (선택 월)
      supabase
        .from('deliveries')
        .select(`
          id, year_month, delivery_date, product_id,
          quantity_kg, memo,
          product:products(id, name, display_name),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .eq('year_month', yearMonth)
        .in('product_id',
          // FeSi product IDs - will filter after product lookup
          ['00000000-0000-0000-0000-000000000000'] // placeholder
        )
        .limit(0), // skip for now, will re-query below

      // 환율 기록 전체 (최근 12개월)
      supabase
        .from('fx_rates')
        .select('id, bl_date, product_id, rate_krw_per_usd, memo, created_at')
        .order('bl_date', { ascending: false })
        .limit(100),
    ])

    fesiProducts = pRes.data ?? []
    fxRates = rRes.data ?? []

    if (fesiProducts.length > 0) {
      const fesiIds = fesiProducts.map((p: { id: string }) => p.id)
      const dRes2 = await supabase
        .from('deliveries')
        .select(`
          id, year_month, delivery_date, product_id,
          quantity_kg, memo,
          product:products(id, name, display_name),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .eq('year_month', yearMonth)
        .in('product_id', fesiIds)
        .order('delivery_date', { ascending: true })

      if (dRes2.error) fetchError = `FeSi 입고: ${dRes2.error.message}`
      else fesiDeliveries = dRes2.data ?? []
    }

    if (pRes.error) fetchError = `품목: ${pRes.error.message}`
    else if (rRes.error) fetchError = `환율: ${rRes.error.message}`
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e)
  }

  if (fetchError) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold text-red-600 mb-2">데이터 로드 오류</h2>
        <div className="bg-red-50 border border-red-200 rounded p-3 font-mono text-xs text-red-800">
          {fetchError}
        </div>
      </div>
    )
  }

  return (
    <FeSiClient
      yearMonth={yearMonth}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fesiProducts={fesiProducts as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialDeliveries={fesiDeliveries as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialFxRates={fxRates as any[]}
    />
  )
}
