/**
 * 페로실리콘 (FeSi75 / FeSi60)
 * - 입고 건별 생성 (BL 날짜 기준)
 * - 동국→한국에이원 역발행 (입고후 10일), EG→한국에이원 달러 계산서 (입고후 15일)
 */
import { nthDay, addDays } from '@/lib/date'
import { makeInvoice, calcCombinedMargin } from './utils'
import type { DeliveryForInvoice, InvoiceToCreate } from './types'

export function genFeSi(
  delivery: DeliveryForInvoice,
  ym: string
): InvoiceToCreate[] {
  const pid    = delivery.product_id
  const deliveryYM = delivery.year_month
  const ids    = [delivery.id]
  const refDate = delivery.delivery_date ?? nthDay(ym, 15)  // BL 날짜 or 추정
  const pay10  = addDays(refDate, 10)   // 동국→한국에이원 입고 후 10일
  const pay15  = addDays(refDate, 15)   // 한국에이원→EG 입고 후 15일

  // BL 날짜 기준 실제 환율 우선, 없으면 계약 참고 환율
  const rate        = delivery.fx_rate ?? delivery.contract.reference_exchange_rate ?? 1
  const sellUsdTotal = delivery.contract.sell_price * delivery.quantity_kg / 1000
  const sellTotal    = sellUsdTotal * rate
  const costUsdTotal = delivery.contract.cost_price * delivery.quantity_kg / 1000
  const costKrwTotal = costUsdTotal * rate

  const { geumhwa, raseong } = calcCombinedMargin([delivery])

  return [
    // 동국→한국에이원 역발행 (원화)
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '한국에이원', supply: sellTotal, vat: true,
      basisDate: refDate, deadline: refDate, paymentDue: pay10,
      type: 'sales',
      memo: `역발행 BL ${refDate} — 입고후10일 대금`,
    }),
    // EG→한국에이원 (달러 계산서, KRW 환산 표시)
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: 'EG', to: '한국에이원', supply: costKrwTotal, vat: true,
      basisDate: refDate, deadline: refDate, paymentDue: pay15,
      type: 'cost',
      memo: `EG 달러계산서 BL ${refDate} | USD ${costUsdTotal.toFixed(2)} × ${rate}원 — 입고후15일 송금`,
    }),
    // 한국에이원→금화 커미션
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '금화', supply: geumhwa, vat: true,
      basisDate: pay15, deadline: pay15, paymentDue: pay15,
      type: 'commission', memo: 'EG 지급 완료 후 금화 커미션 1/3',
    }),
    // 한국에이원→라성 커미션
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '라성', supply: raseong, vat: true,
      basisDate: pay15, deadline: pay15, paymentDue: pay15,
      type: 'commission', memo: 'EG 지급 완료 후 라성 커미션 (나머지)',
    }),
  ]
}
