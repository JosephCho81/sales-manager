// unstable_cache: Next.js 권장 서버 캐시 API. 이름의 "unstable_"은 역사적 명명으로,
// 실제로는 프로덕션에서 안정적으로 사용 가능하다.
import { unstable_cache } from 'next/cache'
import { toMessage } from '@/lib/error'
import { shiftMonths } from '@/lib/date'
import { createAdminClient } from '@/lib/supabase/server'
import AnalyticsClient from './AnalyticsClient'
import FetchErrorView from '@/components/FetchErrorView'
import {
  buildAllAnalytics,
  extractAvailableProducts,
  type DeliveryForAnalytics,
  type CommissionEntry,
} from './analytics-compute'

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

    const DELIVERY_SELECT = `
      id, year_month, invoice_month, product_id,
      quantity_kg, depreciation_amount,
      product:products(id, name, display_name, buyer),
      contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
    `

    // 1) 납품 조회 (invoice_month 기준) — totals·monthlyData·커미션 매칭용
    const dRes = await supabase
      .from('deliveries')
      .select(DELIVERY_SELECT)
      .gte('invoice_month', fromYM)
      .lte('invoice_month', toYM)
      .order('invoice_month')

    if (dRes.error) throw new Error(dRes.error.message)
    const deliveries = (dRes.data ?? []) as unknown as DeliveryForAnalytics[]

    // 2) productRows용 확장 조회 (year_month 기준)
    //    offset+2 계약 건(year_month < invoice_month)의 납품월을 키로,
    //    같은 납품월의 offset=0 형제 건까지 포함하여 합산한다.
    //    예) 4월 조회 → 2월분 offset+2 건 발견 → year_month=2026-02 전체 재조회
    //                → offset=0(2026-02, invoice_month=2026-02)도 같은 버킷에 합산
    const primaryYMs = [
      ...new Set(
        deliveries
          .filter(d => d.year_month < d.invoice_month)
          .map(d => d.year_month)
          .filter(Boolean)
      ),
    ]
    let rowDeliveries: DeliveryForAnalytics[]
    if (primaryYMs.length > 0) {
      const rRes = await supabase
        .from('deliveries')
        .select(DELIVERY_SELECT)
        .in('year_month', primaryYMs)
      rowDeliveries = rRes.error
        ? deliveries.filter(d => d.year_month < d.invoice_month)
        : (rRes.data ?? []) as unknown as DeliveryForAnalytics[]
    } else {
      rowDeliveries = []
    }

    // 3) 커미션은 납품의 실제 year_month(납품월) 범위로 조회
    //    invoice_month ≠ year_month이므로 별도 범위 계산 필요
    //    현대제철 AL30 커미션은 delivery year_month+1 기준이므로 상한 1개월 확장
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
      rowDeliveries,
      commissions: (cRes.data ?? []) as CommissionEntry[],
    }
  },
  ['analytics-data'],
  { revalidate: 120 },
)

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

  try {
    const { deliveries: allDeliveries, rowDeliveries: allRowDeliveries, commissions } = await fetchAnalyticsData(fromYM, toYM)

    // 필터 드롭다운용 품목 목록은 반드시 전체(필터 전) 데이터에서 추출
    const availableProducts = extractAvailableProducts(allDeliveries)

    // 서버에서 필터 적용 — 클라이언트에 raw deliveries 전달 불필요
    const applyFilter = (d: DeliveryForAnalytics) => {
      if (filterProduct !== 'all' && d.product?.name  !== filterProduct) return false
      if (filterBuyer   !== 'all' && d.product?.buyer !== filterBuyer)   return false
      return true
    }
    const filtered    = allDeliveries.filter(applyFilter)
    const filteredRows = allRowDeliveries.filter(applyFilter)

    const precomputed = buildAllAnalytics(filtered, filteredRows, commissions, fromYM, toYM)

    return (
      <AnalyticsClient
        fromYM={fromYM}
        toYM={toYM}
        mode={mode}
        filterProduct={filterProduct}
        filterBuyer={filterBuyer}
        availableProducts={availableProducts}
        precomputed={precomputed}
      />
    )
  } catch (e) {
    return <FetchErrorView message={toMessage(e)} />
  }
}
