import { unstable_cache } from 'next/cache'
import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import { shiftMonths } from '@/lib/date'
import AnalyticsClient from './AnalyticsClient'
import FetchErrorView from '@/components/FetchErrorView'
import {
  buildAllAnalytics,
  type DeliveryForAnalytics,
  type CommissionEntry,
} from './analytics-compute'

export const dynamic = 'force-dynamic'

type SP = Promise<{ month?: string; from?: string; to?: string; year?: string }>

function currentYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Supabase 조회 결과를 2분간 캐싱.
 * 같은 기간을 반복 조회할 때 DB 왕복을 건너뛴다.
 * 캐시 키: ['analytics-data', fromYM, toYM]
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
  { revalidate: 120 },   // 2분 캐시
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

  try {
    const { deliveries, commissions } = await fetchAnalyticsData(fromYM, toYM)

    // 서버에서 단일 패스로 전체 계산 — 클라이언트는 필터 없는 초기 상태에서
    // 이 결과를 그대로 사용하므로 첫 렌더에 계산 비용이 없다
    const precomputed = buildAllAnalytics(deliveries, commissions, fromYM, toYM)

    return (
      <AnalyticsClient
        fromYM={fromYM}
        toYM={toYM}
        mode={mode}
        deliveries={deliveries}
        commissions={commissions}
        precomputed={precomputed}
      />
    )
  } catch (e) {
    return <FetchErrorView message={toMessage(e)} />
  }
}
