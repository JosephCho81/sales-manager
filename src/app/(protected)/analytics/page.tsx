import { createClient } from '@/lib/supabase/server'
import AnalyticsClient from './AnalyticsClient'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ month?: string }>

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const now = new Date()
  const yearMonth =
    params.month ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deliveries: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let monthInvoices: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allCostInvoices: any[] = []
  let fetchError: string | null = null

  try {
    const supabase = await createClient()
    const [dRes, mRes, cRes] = await Promise.all([
      // 해당 월 입고 (마진 계산용)
      supabase
        .from('deliveries')
        .select(`
          id, year_month, product_id,
          quantity_kg, addl_quantity_kg, addl_margin_per_ton,
          product:products(id, name, display_name, buyer, vat),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .eq('year_month', yearMonth),

      // 해당 월 계산서 지시 전체 (회사별 현황용)
      supabase
        .from('invoice_instructions')
        .select(
          'id, year_month, product_id, from_company, to_company, supply_amount, vat_amount, total_amount, invoice_basis_date, payment_due_date, is_paid, paid_at, invoice_type, memo'
        )
        .eq('year_month', yearMonth),

      // 원가 계산서 전체 (거래처 지급 이력용 — 월 필터 없음)
      supabase
        .from('invoice_instructions')
        .select(
          'id, year_month, product_id, from_company, to_company, supply_amount, vat_amount, total_amount, invoice_basis_date, payment_due_date, is_paid, paid_at, invoice_type, memo'
        )
        .eq('invoice_type', 'cost')
        .order('payment_due_date', { ascending: false })
        .limit(300),
    ])

    if (dRes.error) fetchError = `입고: ${dRes.error.message}`
    else if (mRes.error) fetchError = `계산서: ${mRes.error.message}`
    else if (cRes.error) fetchError = `원가이력: ${cRes.error.message}`
    else {
      deliveries = dRes.data ?? []
      monthInvoices = mRes.data ?? []
      allCostInvoices = cRes.data ?? []
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
    <AnalyticsClient
      yearMonth={yearMonth}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialDeliveries={deliveries as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      monthInvoices={monthInvoices as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allCostInvoices={allCostInvoices as any[]}
    />
  )
}
