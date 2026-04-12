// unstable_cache: Next.js 권장 서버 캐시 API. 이름의 "unstable_"은 역사적 명명으로,
// 실제로는 프로덕션에서 안정적으로 사용 가능하다.
import { unstable_cache } from 'next/cache'
import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import { shiftMonths } from '@/lib/date'
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
    const [dRes, cRes] = await Promise.all([
      supabase
        .from('deliveries')
        .select(`
          id, year_month, invoice_month, product_id,
          quantity_kg,
          product:products(id, name, display_name, buyer),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .gte('invoice_month', fromYM)
        .lte('invoice_month', toYM)
        .order('invoice_month'),

      // 커미션: 지급월 = year_month + 1 → 범위 -1개월 shift
      supabase
        .from('commissions')
        .select('year_month, commission_amount, company')
        .gte('year_month', shiftMonths(fromYM, -1))
        .lte('year_month', shiftMonths(toYM, -1)),
    ])

    if (dRes.error) throw new Error(dRes.error.message)
    if (cRes.error) throw new Error(cRes.error.message)

    return {
      deliveries:  (dRes.data ?? []) as unknown as DeliveryForAnalytics[],
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
    const { deliveries: allDeliveries, commissions } = await fetchAnalyticsData(fromYM, toYM)

    // 필터 드롭다운용 품목 목록은 반드시 전체(필터 전) 데이터에서 추출
    const availableProducts = extractAvailableProducts(allDeliveries)

    // 서버에서 필터 적용 — 클라이언트에 raw deliveries 전달 불필요
    const filtered = allDeliveries.filter(d => {
      if (filterProduct !== 'all' && d.product?.name  !== filterProduct) return false
      if (filterBuyer   !== 'all' && d.product?.buyer !== filterBuyer)   return false
      return true
    })

    const precomputed = buildAllAnalytics(filtered, commissions, fromYM, toYM)

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
