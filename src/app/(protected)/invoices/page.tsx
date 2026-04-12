import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import FetchErrorView from '@/components/FetchErrorView'
import InvoicesClient from './InvoicesClient'
import { type DeliveryRawForInvoice, type FxRateRaw, type InvoiceRow } from '@/lib/invoice-generator'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ month?: string }>

function currentYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const params    = await searchParams
  const yearMonth = params.month ?? currentYM()

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

      // FeSi용 BL 날짜 기준 실제 환율
      supabase
        .from('fx_rates')
        .select('id, bl_date, product_id, rate_krw_per_usd')
        .gte('bl_date', `${yearMonth}-01`)
        .lte('bl_date', `${yearMonth}-31`),
    ])

    if (dRes.error) throw new Error(`입고 조회 실패: ${dRes.error.message}`)
    if (iRes.error) throw new Error(`계산서 조회 실패: ${iRes.error.message}`)

    return (
      <InvoicesClient
        key={yearMonth}
        yearMonth={yearMonth}
        initialDeliveries={(dRes.data ?? []) as unknown as DeliveryRawForInvoice[]}
        initialInvoices={(iRes.data ?? []) as unknown as InvoiceRow[]}
        fxRates={(fxRes.data ?? []) as unknown as FxRateRaw[]}
      />
    )
  } catch (e) {
    return <FetchErrorView message={toMessage(e)} />
  }
}
