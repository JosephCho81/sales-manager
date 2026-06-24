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

  // 파라미터에서 바로 계산 가능한 값들 — DB 조회 전에 선산
  const dongkukCommMonth   = shiftMonths(yearMonth, -2)
  const hyundaiCommMonth   = shiftMonths(yearMonth, -1)
  const hyundaiDeliveryYM  = shiftMonths(yearMonth, -2)

  try {
    const supabase = createAdminClient()

    // 6개 쿼리 전부 병렬 처리 (이전: 3단계 순차 왕복)
    const [dRes, iRes, fxRes, pRes, cRes, edRes] = await Promise.all([
      // 1) 해당 월 입고 (invoice_month 기준)
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

      // 2) 계산서 발행 지시
      supabase
        .from('invoice_instructions')
        .select('*')
        .eq('year_month', yearMonth)
        .order('created_at', { ascending: true }),

      // 3) FeSi용 BL 날짜 기준 환율
      //    상한은 다음 달 1일 미만 — '${yearMonth}-31'은 30일까지인 달에서
      //    잘못된 날짜(22008)로 쿼리가 실패하던 버그 수정
      supabase
        .from('fx_rates')
        .select('id, bl_date, product_id, rate_krw_per_usd')
        .gte('bl_date', `${yearMonth}-01`)
        .lt('bl_date', `${shiftMonths(yearMonth, 1)}-01`),

      // 4) 품목 전체 목록 (product_id → display_name 매핑용)
      supabase
        .from('products')
        .select('id, name, display_name'),

      // 5) 커미션 조회 — 동국제강=M-2, 현대제철=M-1 고정 오프셋
      supabase
        .from('commissions')
        .select('id, year_month, company, commission_amount, memo')
        .in('year_month', [dongkukCommMonth, hyundaiCommMonth])
        .order('created_at', { ascending: true }),

      // 6) 현대제철 M-2 납품 (AL40/AL30 이중계약 extra 처리용)
      supabase
        .from('deliveries')
        .select(`
          id, year_month, invoice_month, delivery_date, product_id,
          quantity_kg, depreciation_amount,
          product:products(id, name, display_name, vat),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .eq('year_month', hyundaiDeliveryYM)
        .order('created_at', { ascending: true }),
    ])

    if (dRes.error)  throw new Error(`입고 조회 실패: ${dRes.error.message}`)
    if (iRes.error)  throw new Error(`계산서 조회 실패: ${iRes.error.message}`)
    if (fxRes.error) throw new Error(`환율 조회 실패: ${fxRes.error.message}`)
    // 아래 3개도 실패 시 조용히 빈 배열로 폴백하면 커미션/이중계약/품목명이 누락됨 — 명시적 throw
    if (cRes.error)  throw new Error(`커미션 조회 실패: ${cRes.error.message}`)
    if (edRes.error) throw new Error(`추가 입고 조회 실패: ${edRes.error.message}`)
    if (pRes.error)  throw new Error(`품목 조회 실패: ${pRes.error.message}`)

    // 커미션: 회사별 월 매칭 검증 (동국제강=M-2, 현대제철=M-1만 허용)
    const commissions = ((cRes.data ?? []) as unknown as CommissionForInvoice[]).filter(c =>
      (c.company === '동국제강' && c.year_month === dongkukCommMonth) ||
      (c.company === '현대제철' && c.year_month === hyundaiCommMonth)
    )

    // 입고 합산 (중복 제거)
    // offset=0 AL40/AL30 건(year_month === invoice_month)은 M+2 invoice에서 extra로 포함
    const extraDeliveries = ((edRes.data ?? []) as unknown as DeliveryRawForInvoice[])
      .filter(d => {
        const n = d.product?.name?.toUpperCase()
        return (n?.startsWith('AL40') ?? false) || n === 'AL30'
      })

    const deliveryMap = new Map<string, DeliveryRawForInvoice>()
    for (const d of (dRes.data ?? []) as unknown as DeliveryRawForInvoice[]) {
      const pName = d.product?.name?.toUpperCase()
      if (d.year_month === yearMonth && ((pName?.startsWith('AL40') ?? false) || pName === 'AL30')) continue
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
        initialCommissions={commissions}
        products={(pRes.data ?? []) as Array<{ id: string; name: string; display_name: string | null }>}
      />
    )
  } catch (e) {
    return <FetchErrorView message={toMessage(e)} />
  }
}
