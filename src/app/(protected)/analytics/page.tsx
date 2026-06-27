import { unstable_cache } from 'next/cache'
import { toMessage } from '@/lib/error'
import { shiftMonths } from '@/lib/date'
import { createAdminClient } from '@/lib/supabase/server'
import AnalyticsClient from './AnalyticsClient'
import FetchErrorView from '@/components/FetchErrorView'
import { buildAllAnalytics, extractAvailableProducts } from './analytics-compute'
import { calcPrevPeriod, buildChangeAnalysis } from './analytics-change'
import type { DeliveryForAnalytics, CommissionEntry, ProductRow, ChangeAnalysisResult } from './analytics-types'

export const dynamic = 'force-dynamic'

type SP = Promise<{
  month?: string; from?: string; to?: string; year?: string
  product?: string; buyer?: string
}>

function currentYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Supabase 조회 결과를 2분간 캐싱.
 * 캐시 키: ['analytics-data', fromYM, toYM]
 * 필터(product/buyer)는 캐시 밖에서 처리 → 같은 기간은 캐시 재사용.
 */
const fetchAnalyticsData = unstable_cache(
  async (fromYM: string, toYM: string) => {
    const supabase = createAdminClient()

    const [dRes, fxRes] = await Promise.all([
      supabase
        .from('deliveries')
        .select(`
          id, year_month, invoice_month, delivery_date, product_id,
          quantity_kg, depreciation_amount,
          product:products(id, name, display_name, buyer),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .gte('invoice_month', fromYM)
        .lte('invoice_month', toYM)
        .order('invoice_month'),
      // FeSi 실제 환율 (product_id + delivery_date 매칭). 작은 테이블이라 전체 조회
      supabase.from('fx_rates').select('product_id, bl_date, rate_krw_per_usd'),
    ])

    if (dRes.error)  throw new Error(dRes.error.message)
    if (fxRes.error) throw new Error(fxRes.error.message)

    const fxMap = new Map<string, number>()
    for (const r of (fxRes.data ?? []) as Array<{ product_id: string; bl_date: string; rate_krw_per_usd: number }>) {
      fxMap.set(`${r.product_id}:${r.bl_date}`, Number(r.rate_krw_per_usd))
    }
    const deliveries = ((dRes.data ?? []) as unknown as DeliveryForAnalytics[]).map(d => ({
      ...d,
      fx_rate: d.delivery_date ? (fxMap.get(`${d.product_id}:${d.delivery_date}`) ?? null) : null,
    }))

    // 현대제철 AL30 커미션은 delivery year_month+1 기준이므로 상한 1개월 확장
    const yms = deliveries.map(d => d.year_month).filter(Boolean).sort()
    const commFromYM = yms.length ? yms[0]                              : fromYM
    const commToYM   = shiftMonths(yms.length ? yms[yms.length - 1] : toYM, +1)

    const cRes = await supabase
      .from('commissions')
      .select('year_month, commission_amount, company, quantity_kg, price_per_ton')
      .gte('year_month', commFromYM)
      .lte('year_month', commToYM)

    if (cRes.error) throw new Error(cRes.error.message)

    return {
      deliveries,
      commissions: (cRes.data ?? []) as CommissionEntry[],
    }
  },
  ['analytics-data'],
  { revalidate: 120 },
)

function applyDeliveryFilter(
  deliveries: DeliveryForAnalytics[],
  filterProduct: string,
  filterBuyer: string,
): DeliveryForAnalytics[] {
  return deliveries.filter(d => {
    if (filterProduct !== 'all' && d.product?.name  !== filterProduct) return false
    if (filterBuyer   !== 'all' && d.product?.buyer !== filterBuyer)   return false
    // 현대제철 AL40 이중계약: year_month === invoice_month인 건은 즉시청구(offset=0) 중복분 — analytics 제외
    // (이연청구 offset=2 짝이 invoice_month=납품월+2로 집계됨). AL30은 단일 계약(offset=2)이라 제외 대상 아님
    const pName = d.product?.name?.toUpperCase() ?? ''
    if (d.year_month === d.invoice_month && pName.startsWith('AL40')) return false
    return true
  })
}

export default async function AnalyticsPage({ searchParams }: { searchParams: SP }) {
  const params = await searchParams

  let fromYM: string, toYM: string, mode: 'month' | 'range' | 'year'

  if (params.year) {
    fromYM = `${params.year}-01`
    toYM   = `${params.year}-12`
    mode   = 'year'
  } else if (params.from || params.to) {
    const ym = currentYM()
    fromYM = params.from ?? ym
    toYM   = params.to   ?? ym
    mode   = 'range'
  } else {
    const ym = params.month ?? currentYM()
    fromYM = ym
    toYM   = ym
    mode   = 'month'
  }

  const filterProduct = params.product ?? 'all'
  const filterBuyer   = params.buyer   ?? 'all'

  // 이전 기간 범위는 URL params만으로 계산 가능 — 현재 기간 조회와 병렬 처리
  const { prevFromYM, prevToYM } = calcPrevPeriod(fromYM, toYM, mode)

  try {
    const [currentData, prevData] = await Promise.all([
      fetchAnalyticsData(fromYM, toYM),
      fetchAnalyticsData(prevFromYM, prevToYM).catch(() => null),
    ])

    const { deliveries: allDeliveries, commissions } = currentData

    const availableProducts = extractAvailableProducts(allDeliveries)
    const filtered = applyDeliveryFilter(allDeliveries, filterProduct, filterBuyer)
    const precomputed = buildAllAnalytics(filtered, commissions, fromYM, toYM)

    let prevProductRows: ProductRow[] = []
    let hasPrevData = false
    if (prevData && prevData.deliveries.length > 0) {
      hasPrevData = true
      const prevFiltered = applyDeliveryFilter(prevData.deliveries, filterProduct, filterBuyer)
      prevProductRows = buildAllAnalytics(prevFiltered, prevData.commissions, prevFromYM, prevToYM).productRows
    }

    const changeAnalysis: ChangeAnalysisResult = buildChangeAnalysis(
      precomputed.productRows, prevProductRows, hasPrevData, prevFromYM, prevToYM
    )

    return (
      <AnalyticsClient
        fromYM={fromYM}
        toYM={toYM}
        mode={mode}
        filterProduct={filterProduct}
        filterBuyer={filterBuyer}
        availableProducts={availableProducts}
        precomputed={precomputed}
        changeAnalysis={changeAnalysis}
      />
    )
  } catch (e) {
    return <FetchErrorView message={toMessage(e)} />
  }
}
