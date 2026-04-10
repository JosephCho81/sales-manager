import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import { shiftMonths } from '@/lib/date'
import AnalyticsClient from './AnalyticsClient'
import FetchErrorView from '@/components/FetchErrorView'
import type { ShortageTransaction } from './analytics-compute'

export const dynamic = 'force-dynamic'

type SP = Promise<{ month?: string; from?: string; to?: string; year?: string }>

function currentYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deliveries: any[] = []
  let shortageTransactions: ShortageTransaction[] = []
  let fetchError: string | null = null

  try {
    const supabase = createAdminClient()
    const [dRes, sRes] = await Promise.all([
      supabase
        .from('deliveries')
        .select(`
          id, year_month, invoice_month, product_id,
          quantity_kg, addl_quantity_kg, addl_margin_per_ton,
          product:products(id, name, display_name, buyer),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .gte('invoice_month', fromYM)
        .lte('invoice_month', toYM)
        .order('invoice_month'),

      // AL30 부족분 커미션: 지급월 = year_month + 1, 조회 범위 내 지급월 기준 필터
      supabase
        .from('hyundai_transactions')
        .select('year_month, commission_amount')
        .eq('commission_type', 'shortage')
        .gte('year_month', shiftMonths(fromYM, -1))  // 지급월이 fromYM인 것 = year_month가 fromYM-1
        .lte('year_month', shiftMonths(toYM, -1)),   // 지급월이 toYM인 것 = year_month가 toYM-1
    ])

    if (dRes.error) fetchError = dRes.error.message
    else if (sRes.error) fetchError = sRes.error.message
    else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deliveries = (dRes.data ?? []) as any[]
      shortageTransactions = (sRes.data ?? []) as ShortageTransaction[]
    }
  } catch (e) {
    fetchError = toMessage(e)
  }

  if (fetchError) return <FetchErrorView message={fetchError} />

  return (
    <AnalyticsClient
      fromYM={fromYM}
      toYM={toYM}
      mode={mode}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deliveries={deliveries as any[]}
      shortageTransactions={shortageTransactions}
    />
  )
}
