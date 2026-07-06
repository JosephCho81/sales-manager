import 'server-only'
import { shiftMonths } from '@/lib/date'
import { createAdminClient } from '@/lib/supabase/server'
import type { DeliveryRawForInvoice, FxRateRaw, CommissionForInvoice, MonthlyDepInput } from '@/lib/invoice-generator'

export type InvoiceInputs = {
  deliveries: DeliveryRawForInvoice[]
  fxRates: FxRateRaw[]
  commissions: CommissionForInvoice[]
  monthlyDeps: MonthlyDepInput[]
}

/**
 * 계산서 생성 입력(입고·환율·커미션)을 DB에서 직접 조회.
 * 페이지 렌더와 재생성 액션이 공유 — 재생성이 클라이언트 props(로드 시점 스냅샷)를
 * 신뢰하면 그 사이 등록된 커미션이 통째로 누락된 채 전체 교체되므로(2026-07-03 현대제철
 * 커미션 유실 사고) 반드시 이 함수로 fresh 조회한다.
 */
export async function fetchInvoiceInputs(yearMonth: string): Promise<InvoiceInputs> {
  const supabase = createAdminClient()

  const dongkukCommMonth  = shiftMonths(yearMonth, -2)
  const hyundaiCommMonth  = shiftMonths(yearMonth, -1)
  const hyundaiDeliveryYM = shiftMonths(yearMonth, -2)

  const [dRes, fxRes, cRes, edRes] = await Promise.all([
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

    // 2) FeSi용 BL 날짜 기준 환율
    //    상한은 다음 달 1일 미만 — '${yearMonth}-31'은 30일까지인 달에서
    //    잘못된 날짜(22008)로 쿼리가 실패하던 버그 수정
    supabase
      .from('fx_rates')
      .select('id, bl_date, product_id, rate_krw_per_usd')
      .gte('bl_date', `${yearMonth}-01`)
      .lt('bl_date', `${shiftMonths(yearMonth, 1)}-01`),

    // 3) 커미션 조회 — 동국제강=M-2, 현대제철=M-1 고정 오프셋
    supabase
      .from('commissions')
      .select('id, year_month, company, commission_amount, memo')
      .in('year_month', [dongkukCommMonth, hyundaiCommMonth])
      .order('created_at', { ascending: true }),

    // 4) 현대제철 M-2 납품 (AL40/AL30 이중계약 extra 처리용)
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
  if (fxRes.error) throw new Error(`환율 조회 실패: ${fxRes.error.message}`)
  // 아래 2개도 실패 시 조용히 빈 배열로 폴백하면 커미션/이중계약이 누락됨 — 명시적 throw
  if (cRes.error)  throw new Error(`커미션 조회 실패: ${cRes.error.message}`)
  if (edRes.error) throw new Error(`추가 입고 조회 실패: ${edRes.error.message}`)

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

  const dedupedDeliveries = Array.from(deliveryMap.values())

  // 월별 감가 — 조회된 납품월들만 좁게 조회 (분탄 offset=1: 지급월 M → 납품월 M−1)
  const ymList = Array.from(new Set(dedupedDeliveries.map(d => d.year_month)))
  let monthlyDeps: MonthlyDepInput[] = []
  if (ymList.length > 0) {
    const mdRes = await supabase
      .from('monthly_depreciations')
      .select('product_id, year_month, amount')
      .in('year_month', ymList)
    // 조용히 빈 배열로 폴백하면 감가 누락된 총액 계산서가 발행됨 — 명시적 throw
    if (mdRes.error) throw new Error(`월별 감가 조회 실패: ${mdRes.error.message}`)
    monthlyDeps = ((mdRes.data ?? []) as MonthlyDepInput[]).map(md => ({ ...md, amount: Number(md.amount) }))
  }

  return {
    deliveries: dedupedDeliveries,
    fxRates: (fxRes.data ?? []) as unknown as FxRateRaw[],
    commissions,
    monthlyDeps,
  }
}
