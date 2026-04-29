import { toMessage } from '@/lib/error'
import { shiftMonths } from '@/lib/date'
import { createAdminClient } from '@/lib/supabase/server'
import FetchErrorView from '@/components/FetchErrorView'
import InvoicesClient from './InvoicesClient'
import { type DeliveryRawForInvoice, type FxRateRaw, type InvoiceRow, type CommissionForInvoice } from '@/lib/invoice-generator'

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

    // 1단계: 입고·계산서·환율·품목 병렬 조회
    const [dRes, iRes, fxRes, pRes] = await Promise.all([
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

      // 품목 전체 목록 (product_id → display_name 매핑용)
      supabase
        .from('products')
        .select('id, name, display_name'),
    ])

    if (dRes.error) throw new Error(`입고 조회 실패: ${dRes.error.message}`)
    if (iRes.error) throw new Error(`계산서 조회 실패: ${iRes.error.message}`)

    // 2단계: 입고 데이터 기반으로 커미션 조회 월 계산
    // - AL35B (동국제강): 커미션 year_month = 납품 year_month (동일)
    // - AL40/AL30 (현대제철): 커미션 year_month = 납품 year_month + 1
    // invoice_month_offset이 0인 경우 납품 year_month ≠ yearMonth가 되므로
    // 단순 eq(yearMonth)로는 현대제철 커미션을 놓칠 수 있어 별도 계산
    const commMonths = new Set<string>([yearMonth, shiftMonths(yearMonth, -1)])
    for (const d of (dRes.data ?? []) as unknown as DeliveryRawForInvoice[]) {
      const name = d.product?.name?.toUpperCase() ?? ''
      if (name === 'AL35B') {
        commMonths.add(d.year_month)
      } else if (name.startsWith('AL40') || name === 'AL30') {
        commMonths.add(shiftMonths(d.year_month, 1))
      }
    }

    // 3단계: 커미션 조회 (계산된 월 목록으로)
    const cRes = await supabase
      .from('commissions')
      .select('id, year_month, company, commission_amount, memo')
      .in('year_month', Array.from(commMonths))
      .order('created_at', { ascending: true })

    // 4단계: 현대제철 커미션에서 역산한 납품월로 AL40/AL30 입고 추가 조회
    // 현대제철 커미션 year_month = 납품월+1 이므로 -1 하면 실제 납품월
    // invoice_month_offset=0 이면 AL40 납품이 step1 조회에서 누락되는 경우를 보완
    const fetchedYMs = new Set(
      (dRes.data ?? []).map(d => (d as unknown as DeliveryRawForInvoice).year_month)
    )
    const hyundaiDeliveryYMs = [
      ...new Set(
        (cRes.data ?? [])
          .filter(c => c.company === '현대제철')
          .map(c => shiftMonths(c.year_month, -1))
          .filter(ym => !fetchedYMs.has(ym))
      ),
    ]

    let extraDeliveries: DeliveryRawForInvoice[] = []
    if (hyundaiDeliveryYMs.length > 0) {
      const edRes = await supabase
        .from('deliveries')
        .select(`
          id, year_month, invoice_month, delivery_date, product_id,
          quantity_kg, depreciation_amount,
          product:products(id, name, display_name, vat),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .in('year_month', hyundaiDeliveryYMs)
        .order('created_at', { ascending: true })

      extraDeliveries = ((edRes.data ?? []) as unknown as DeliveryRawForInvoice[])
        .filter(d => {
          const n = d.product?.name?.toUpperCase()
          return (n?.startsWith('AL40') ?? false) || n === 'AL30'
        })
    }

    // 입고 합산 (중복 제거)
    const deliveryMap = new Map<string, DeliveryRawForInvoice>()
    for (const d of (dRes.data ?? []) as unknown as DeliveryRawForInvoice[]) {
      deliveryMap.set(d.id, d)
    }
    for (const d of extraDeliveries) {
      if (!deliveryMap.has(d.id)) deliveryMap.set(d.id, d)
    }
    const allDeliveries = Array.from(deliveryMap.values())

    return (
      <InvoicesClient
        key={yearMonth}
        yearMonth={yearMonth}
        initialDeliveries={allDeliveries}
        initialInvoices={(iRes.data ?? []) as unknown as InvoiceRow[]}
        fxRates={(fxRes.data ?? []) as unknown as FxRateRaw[]}
        initialCommissions={(cRes.data ?? []) as unknown as CommissionForInvoice[]}
        products={(pRes.data ?? []) as Array<{ id: string; name: string; display_name: string | null }>}
      />
    )
  } catch (e) {
    return <FetchErrorView message={toMessage(e)} />
  }
}
