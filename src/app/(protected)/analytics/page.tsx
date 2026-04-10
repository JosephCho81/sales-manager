import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import { shiftMonths } from '@/lib/date'
import AnalyticsClient from './AnalyticsClient'
import FetchErrorView from '@/components/FetchErrorView'

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
  let fetchError: string | null = null

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('deliveries')
      .select(`
        id, year_month, product_id,
        quantity_kg, addl_quantity_kg, addl_margin_per_ton,
        product:products(id, name, display_name, buyer),
        contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
      `)
      .gte('year_month', shiftMonths(fromYM, -1))  // AL30 addl(납품월+1) 포함을 위해 1달 앞당김
      .lte('year_month', toYM)
      .order('year_month')

    if (error) fetchError = error.message
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else deliveries = (data ?? []) as any[]
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
    />
  )
}
