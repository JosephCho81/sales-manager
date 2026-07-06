/**
 * 소괴탄(SOGGAE) / 분탄(BUNTAN)
 *
 * 감가(depreciation_amount) 반영:
 *   청구금액 = quantity_kg × 단가 / 1000 − depreciation_amount(원)
 *
 * 소괴탄: 동국→한국에이원 역발행 (VAT 없음), 익월1일 발행, 익월10일 대금; 커미션은 VAT 10%
 * 분탄:  동창→한국에이원→렘코 (VAT 10%), 익월1일 동시 발행, 익월10일 대금
 *        (동국제강 없음. 매입처=동창, 매출처=렘코 역발행)
 *        월별 감가(monthlyDep)는 렘코 매출 계산서만 차감 — 렘코 미수, 계약 종료 후 일괄 회수.
 *        동창 매입·커미션은 총액 기준 유지.
 * 커미션: 익월15일 (공통)
 */
import { splitMargin } from '@/lib/margin'
import { shiftMonths, monthEnd, workingDayFrom, workingDayOnOrAfter } from '@/lib/date'
import { makeInvoice } from './utils'
import type { DeliveryForInvoice, InvoiceToCreate } from './types'

export function genSoggae(
  deliveries: DeliveryForInvoice[],
  ym: string,
): InvoiceToCreate[] {
  const pid        = deliveries[0].product_id
  const deliveryYM = deliveries[0].year_month
  const ids        = deliveries.map(d => d.id)
  const nextM      = shiftMonths(deliveryYM, 1)

  const sellTotal = deliveries.reduce(
    (s, d) => s + d.contract.sell_price * d.quantity_kg / 1000 - (d.depreciation_amount ?? 0),
    0,
  )
  const costTotal = deliveries.reduce(
    (s, d) => s + d.contract.cost_price * d.quantity_kg / 1000 - (d.depreciation_amount ?? 0),
    0,
  )
  const { geumhwa, raseong } = splitMargin(Math.round(sellTotal - costTotal))

  // 워킹데이 보정
  const wBasisM = workingDayFrom(monthEnd(deliveryYM))
  const wDue1N  = workingDayOnOrAfter(nextM, 1)
  const wDue10N = workingDayOnOrAfter(nextM, 10)
  const wDue15N = workingDayOnOrAfter(nextM, 15)

  return [
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '(주)한국에이원', supply: sellTotal, vat: false,
      basisDate: wBasisM, deadline: wDue1N, paymentDue: wDue10N,
      type: 'sales', memo: '동국제강 역발행 — 매출 (VAT없음)',
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '렘코', supply: costTotal, vat: false,
      basisDate: wBasisM, deadline: wDue1N, paymentDue: wDue10N,
      type: 'cost', memo: '렘코 원가 (VAT없음)',
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '금화', supply: geumhwa, vat: true,
      basisDate: wDue15N, deadline: wDue15N, paymentDue: wDue15N,
      type: 'commission', memo: '금화 커미션 1/3',
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '(주)나성', supply: raseong, vat: true,
      basisDate: wDue15N, deadline: wDue15N, paymentDue: wDue15N,
      type: 'commission', memo: '(주)나성 커미션 (나머지)',
    }),
  ]
}

export function genBuntan(
  deliveries: DeliveryForInvoice[],
  ym: string,
  /** 해당 납품월의 월별 감가(원). 렘코 매출 계산서에서만 차감 — 동창 매입·커미션은 총액 기준 */
  monthlyDep: number = 0,
): InvoiceToCreate[] {
  const pid        = deliveries[0].product_id
  const deliveryYM = deliveries[0].year_month
  const ids        = deliveries.map(d => d.id)
  const nextM      = shiftMonths(deliveryYM, 1)

  const sellTotal = deliveries.reduce(
    (s, d) => s + d.contract.sell_price * d.quantity_kg / 1000 - (d.depreciation_amount ?? 0),
    0,
  )
  const costTotal = deliveries.reduce(
    (s, d) => s + d.contract.cost_price * d.quantity_kg / 1000 - (d.depreciation_amount ?? 0),
    0,
  )
  const { geumhwa, raseong } = splitMargin(Math.round(sellTotal - costTotal))

  // 워킹데이 보정
  const wBasisM = workingDayFrom(monthEnd(deliveryYM))
  const wDue1N  = workingDayOnOrAfter(nextM, 1)
  const wDue10N = workingDayOnOrAfter(nextM, 10)
  const wDue15N = workingDayOnOrAfter(nextM, 15)

  return [
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '렘코', to: '(주)한국에이원', supply: sellTotal - monthlyDep, vat: true,
      basisDate: wBasisM, deadline: wDue1N, paymentDue: wDue10N,
      type: 'sales',
      memo: monthlyDep > 0
        ? `렘코 역발행 — 매출 (VAT10%), 월감가 ${monthlyDep.toLocaleString('ko-KR')}원 차감`
        : '렘코 역발행 — 매출 (VAT10%), 익월1일 동시 발행',
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '동창', supply: costTotal, vat: true,
      basisDate: wBasisM, deadline: wDue1N, paymentDue: wDue10N,
      type: 'cost', memo: '(주)한국에이원→동창 — 매입 (VAT10%), 익월1일 동시 발행',
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '금화', supply: geumhwa, vat: true,
      basisDate: wDue15N, deadline: wDue15N, paymentDue: wDue15N,
      type: 'commission', memo: '금화 커미션 1/3',
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '(주)나성', supply: raseong, vat: true,
      basisDate: wDue15N, deadline: wDue15N, paymentDue: wDue15N,
      type: 'commission', memo: '(주)나성 커미션 (나머지)',
    }),
  ]
}
