import { createClient } from '@/lib/supabase/server'
import InvoicesClient from './InvoicesClient'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ month?: string }>

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const now = new Date()
  const yearMonth = params.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deliveries: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let invoices: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fxRates: any[] = []
  let fetchError: string | null = null

  try {
    const supabase = await createClient()
    const [dRes, iRes, fxRes] = await Promise.all([
      supabase
        .from('deliveries')
        .select(`
          id, year_month, delivery_date, product_id,
          quantity_kg, addl_quantity_kg, addl_margin_per_ton,
          hoejin_shortage_kg, hoejin_shortage_price,
          product:products(id, name, display_name, vat),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .eq('year_month', yearMonth)
        .order('created_at', { ascending: true }),
      supabase
        .from('invoice_instructions')
        .select('*')
        .eq('year_month', yearMonth)
        .order('created_at', { ascending: true }),
      // FeSi BL 날짜 기준 실제 환율 (해당 월 앞뒤 2개월 범위)
      supabase
        .from('fx_rates')
        .select('id, bl_date, product_id, rate_krw_per_usd')
        .gte('bl_date', `${yearMonth}-01`)
        .lte('bl_date', `${yearMonth}-31`),
    ])

    if (dRes.error) fetchError = `입고: ${dRes.error.message}`
    else if (iRes.error) fetchError = `계산서: ${iRes.error.message}`
    else {
      deliveries = dRes.data ?? []
      invoices = iRes.data ?? []
      fxRates = fxRes.data ?? []
    }
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e)
  }

  if (fetchError) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold text-red-600 mb-2">데이터 로드 오류</h2>
        <div className="bg-red-50 border border-red-200 rounded p-3 font-mono text-xs text-red-800 mb-4">
          {fetchError}
        </div>
        <p className="text-sm text-gray-500">migration 004_invoice_type.sql 실행 여부를 확인하세요.</p>
      </div>
    )
  }

  return (
    <InvoicesClient
      yearMonth={yearMonth}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialDeliveries={deliveries as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialInvoices={invoices as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fxRates={fxRates as any[]}
    />
  )
}
