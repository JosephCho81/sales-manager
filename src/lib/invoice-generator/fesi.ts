/**
 * 페로실리콘 (FeSi75 / FeSi60) — 동국제강
 *
 * 입고 건별 생성 (BL 날짜 기준)
 *   - 동국→한국에이원 역발행 (원화): 입고후 10일
 *   - EG→한국에이원 달러 계산서 (KRW 환산): 입고후 15일
 *   - 커미션(금화/라성): EG 지급 완료 후
 *
 * 환율 우선순위: BL 날짜 기준 실제 환율 → 계약 참고 환율
 */
import { nthDay, addDays, workingDayFrom } from '@/lib/date'
import { makeInvoice, calcCombinedMargin } from './utils'
import type { DeliveryForInvoice, InvoiceToCreate } from './types'

export function genFeSi(
  delivery: DeliveryForInvoice,
  ym: string,
): InvoiceToCreate[] {
  const pid        = delivery.product_id
  const deliveryYM = delivery.year_month
  const ids        = [delivery.id]
  const refDate    = delivery.delivery_date ?? nthDay(ym, 15)
  const pay10      = workingDayFrom(addDays(refDate, 10))
  const pay15      = workingDayFrom(addDays(refDate, 15))

  const rate         = delivery.fx_rate ?? delivery.contract.reference_exchange_rate ?? 1
  const sellUsdTotal = delivery.contract.sell_price * delivery.quantity_kg / 1000
  const sellTotal    = sellUsdTotal * rate
  const costUsdTotal = delivery.contract.cost_price * delivery.quantity_kg / 1000
  const costKrwTotal = costUsdTotal * rate

  // 실제 세금계산서는 USD 부가세를 센트 단위로 절사(버림)한 뒤 환율을 곱해 KRW로 환산
  // (KRW 환산 공급가액에 바로 10%를 곱하면 원 단위에서 어긋남 — 동국 역발행 계산서 대사 확인.
  //  예: 13,032.69 USD × 10% = 1,303.269 → 절사 1,303.26 (반올림 시 1,303.27로 1원 초과))
  const usdVatToKrw = (usdTotal: number) =>
    Math.round(Math.floor(usdTotal * 0.1 * 100) / 100 * rate)
  const sellVat = usdVatToKrw(sellUsdTotal)
  const costVat = usdVatToKrw(costUsdTotal)

  const { geumhwa, raseong } = calcCombinedMargin([delivery])

  return [
    // 동국→한국에이원 역발행 (원화)
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '(주)한국에이원', supply: sellTotal, vat: true,
      basisDate: refDate, deadline: refDate, paymentDue: pay10,
      type: 'sales', vatOverride: sellVat,
      memo: `역발행 BL ${refDate} — 입고후10일 대금`,
    }),
    // EG→한국에이원 (달러 계산서, KRW 환산)
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: 'EG', to: '(주)한국에이원', supply: costKrwTotal, vat: true,
      basisDate: refDate, deadline: refDate, paymentDue: pay15,
      type: 'cost', vatOverride: costVat,
      memo: `EG 달러계산서 BL ${refDate} | USD ${costUsdTotal.toFixed(2)} × ${rate}원 — 입고후15일 송금`,
    }),
    // 한국에이원→금화 커미션
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '금화', supply: geumhwa, vat: true,
      basisDate: pay15, deadline: pay15, paymentDue: pay15,
      type: 'commission', memo: 'EG 지급 완료 후 금화 커미션 1/3',
    }),
    // 한국에이원→라성 커미션
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '(주)나성', supply: raseong, vat: true,
      basisDate: pay15, deadline: pay15, paymentDue: pay15,
      type: 'commission', memo: 'EG 지급 완료 후 (주)나성 커미션 (나머지)',
    }),
  ]
}
