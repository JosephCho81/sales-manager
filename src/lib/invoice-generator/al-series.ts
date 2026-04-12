/**
 * AL-35B / AL-65B (동국제강 ← 화림)
 *
 * 계산서 구조:
 *   1. 동국제강→한국에이원 역발행 (매출)
 *   2. 화림→금화 원가
 *   3. 금화→한국에이원 (AL35: 원가+마진1/3 / AL65: 원가 패스스루)
 *   4. 한국에이원→금화 커미션 (AL65만)
 *   5. 한국에이원→라성 커미션
 *
 * 날짜 기준: 선택월(ym)이 아닌 배송월(deliveryYM)
 */
import { shiftMonths, monthEnd, nthDay } from '@/lib/date'
import { makeInvoice, separateALMargins } from './utils'
import type { DeliveryForInvoice, InvoiceToCreate } from './types'

export function genALSeries(
  deliveries: DeliveryForInvoice[],
  ym: string,
): InvoiceToCreate[] {
  const pid        = deliveries[0].product_id
  const deliveryYM = deliveries[0].year_month
  const ids        = deliveries.map(d => d.id)
  const hasVat     = deliveries[0].product_vat === 'TEN_PERCENT'
  const isAL35     = deliveries[0].product_name.toUpperCase() === 'AL35B'
  const nextM      = shiftMonths(deliveryYM, 1)
  const next2M     = shiftMonths(deliveryYM, 2)
  const ymLabel    = deliveryYM.replace('-', '년 ') + '월'

  const sellTotal = deliveries.reduce(
    (s, d) => s + d.contract.sell_price * d.quantity_kg / 1000,
    0,
  )
  const costTotal = deliveries.reduce((s, d) => {
    const cost =
      d.contract.currency === 'USD' && d.contract.reference_exchange_rate
        ? d.contract.cost_price * d.contract.reference_exchange_rate
        : d.contract.cost_price
    return s + cost * d.quantity_kg / 1000
  }, 0)

  const { main } = separateALMargins(deliveries)

  return [
    // 1. 동국제강→한국에이원 역발행 (매출)
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '한국에이원', supply: sellTotal, vat: hasVat,
      basisDate: monthEnd(deliveryYM), deadline: nthDay(nextM, 1), paymentDue: monthEnd(nextM),
      type: 'sales', memo: '동국제강 역발행 — 매출',
    }),
    // 2. 화림→금화 원가
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '화림', to: '금화', supply: costTotal, vat: hasVat,
      basisDate: monthEnd(deliveryYM), deadline: nthDay(nextM, 1), paymentDue: nthDay(next2M, 1),
      type: 'cost', memo: '화림 원가 — 당월말 기준, 익월1일 발행 (익익월1일 대금)',
    }),
    // 3. 금화→한국에이원
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '금화', to: '한국에이원',
      supply: isAL35 ? costTotal + main.geumhwa : costTotal,
      vat: hasVat,
      basisDate: monthEnd(nextM), deadline: nthDay(next2M, 1), paymentDue: nthDay(next2M, 1),
      type: 'cost',
      memo: isAL35
        ? '금화→한국에이원 — 원가+마진1/3 (AL35 매매)'
        : '금화→한국에이원 원가 — 익월말 기준',
    }),
    // 4. 한국에이원→금화 커미션 (AL65만)
    ...(!isAL35 ? [makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '금화', supply: main.geumhwa, vat: hasVat,
      basisDate: nthDay(next2M, 1), deadline: nthDay(next2M, 1), paymentDue: nthDay(next2M, 1),
      type: 'commission', memo: `${ymLabel} 마진 — 금화 커미션 1/3`,
    })] : []),
    // 5. 한국에이원→라성 커미션
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '라성', supply: main.raseong, vat: hasVat,
      basisDate: nthDay(next2M, 10), deadline: nthDay(next2M, 10), paymentDue: nthDay(next2M, 10),
      type: 'commission', memo: `${ymLabel} 마진 — 라성 커미션 (나머지)`,
    }),
  ]
}
