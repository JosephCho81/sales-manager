import { createAdminClient } from '@/lib/supabase/server'
import HyundaiClient from './HyundaiClient'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ month?: string }>

export default async function HyundaiPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const now = new Date()
  const yearMonth =
    params.month ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let al30Deliveries: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let al30Invoices: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let shortageEntries: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let al30ProductId: string | null = null
  let fetchError: string | null = null

  try {
    const supabase = createAdminClient()

    // AL30 product_id 조회
    const { data: al30 } = await supabase
      .from('products')
      .select('id')
      .eq('name', 'AL30')
      .single()

    al30ProductId = al30?.id ?? null

    if (al30ProductId) {
      const [dRes, iRes, hRes] = await Promise.all([
        // AL30 입고 데이터 (선택 월)
        supabase
          .from('deliveries')
          .select(`
            id, year_month, delivery_date, product_id,
            quantity_kg, addl_quantity_kg, addl_margin_per_ton,
            memo, created_at,
            contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
          `)
          .eq('year_month', yearMonth)
          .eq('product_id', al30ProductId)
          .order('delivery_date', { ascending: true }),

        // AL30 계산서 지시 (선택 월)
        supabase
          .from('invoice_instructions')
          .select('*')
          .eq('year_month', yearMonth)
          .eq('product_id', al30ProductId)
          .order('invoice_basis_date', { ascending: true }),

        // 부족분 커미션 입력 이력 (hyundai_transactions, 전체)
        supabase
          .from('hyundai_transactions')
          .select('*')
          .eq('commission_type', 'shortage')
          .order('year_month', { ascending: false })
          .limit(24),
      ])

      if (dRes.error) fetchError = `입고: ${dRes.error.message}`
      else if (iRes.error) fetchError = `계산서: ${iRes.error.message}`
      else if (hRes.error) fetchError = `부족분: ${hRes.error.message}`
      else {
        al30Deliveries = dRes.data ?? []
        al30Invoices = iRes.data ?? []
        shortageEntries = hRes.data ?? []
      }
    }
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
    <HyundaiClient
      yearMonth={yearMonth}
      al30ProductId={al30ProductId}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialDeliveries={al30Deliveries as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialInvoices={al30Invoices as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialShortage={shortageEntries as any[]}
    />
  )
}
