import { toMessage } from '@/lib/error'
import FetchErrorView from '@/components/FetchErrorView'
import { createAdminClient } from '@/lib/supabase/server'
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
    const supabase = createAdminClient()
    const [dRes, iRes, fxRes] = await Promise.all([
      supabase
        .from('deliveries')
        .select(`
          id, year_month, invoice_month, delivery_date, product_id,
          quantity_kg, depreciation_amount,
          product:products(id, name, display_name, vat),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .eq('invoice_month', yearMonth)
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
    fetchError = toMessage(e)
  }

  if (fetchError) return <FetchErrorView message={fetchError} hint="migration 004_invoice_type.sql 실행 여부를 확인하세요." />

  return (
    <InvoicesClient
      key={yearMonth}
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
