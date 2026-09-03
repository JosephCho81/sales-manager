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
import { shiftMonths, monthEnd, workingDayFrom, workingDayOnOrAfter } from '@/lib/date'
import { splitMargin } from '@/lib/margin'
import { makeInvoice } from './utils'
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

  // 워킹데이 보정: 발행기준일/지급예정일이 휴일이면 다음 근무일로
  const wBasisM  = workingDayFrom(monthEnd(deliveryYM))
  const wDue1N   = workingDayOnOrAfter(nextM, 1)
  const wEndN    = workingDayFrom(monthEnd(nextM))
  const wDue1N2  = workingDayOnOrAfter(next2M, 1)
  const wDue10N2 = workingDayOnOrAfter(next2M, 10)

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

  // 3사 배분은 **계산서에 실제로 적히는 금액(반올림 후)의 차액**을 나눈다.
  //   - 라인별 마진(Math.round)의 합으로 나누면 매출−매입과 1원 어긋난다
  //   - 금화 몫만 (원가 + floor(톤당마진/3)) × 톤으로 따로 계산하면 톤당 절사분이
  //     톤수만큼 쌓여 금화가 손해를 본다 (2026-07 AL35B: 155원)
  // 세 계산서가 서로 물려 있으므로 반드시 같은 총액에서 한 번만 나눠야 한다.
  const sellSupply = Math.round(sellTotal)
  const costSupply = Math.round(costTotal)
  const main       = splitMargin(sellSupply - costSupply)

  return [
    // 1. 동국제강→한국에이원 역발행 (매출)
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '(주)한국에이원', supply: sellSupply, vat: hasVat,
      basisDate: wBasisM, deadline: wDue1N, paymentDue: wEndN,
      type: 'sales', memo: '동국제강 역발행 — 매출',
    }),
    // 2. 화림→금화 원가
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '화림', to: '금화', supply: costSupply, vat: hasVat,
      basisDate: wBasisM, deadline: wDue1N, paymentDue: wDue1N2,
      type: 'cost', memo: '화림 원가 — 당월말 기준, 익월1일 발행 (익익월1일 대금)',
    }),
    // 3. 금화→한국에이원
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '금화', to: '(주)한국에이원',
      supply: isAL35 ? costSupply + main.geumhwa : costSupply,
      vat: hasVat,
      basisDate: wEndN, deadline: wDue1N2, paymentDue: wDue1N2,
      type: 'cost',
      memo: isAL35
        ? '금화→(주)한국에이원 — 원가+마진 1/3 (AL35 매매)'
        : '금화→(주)한국에이원 원가 — 익월말 기준',
    }),
    // 4. 한국에이원→금화 커미션 (AL65만)
    ...(!isAL35 ? [makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '금화', supply: main.geumhwa, vat: hasVat,
      basisDate: wDue1N2, deadline: wDue1N2, paymentDue: wDue1N2,
      type: 'commission', memo: `${ymLabel} 마진 — 금화 커미션 1/3`,
    })] : []),
    // 5. 한국에이원→라성 커미션
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '(주)나성', supply: main.raseong, vat: hasVat,
      basisDate: wDue10N2, deadline: wDue10N2, paymentDue: wDue10N2,
      type: 'commission', memo: `${ymLabel} 마진 — (주)나성 커미션 (나머지)`,
    }),
  ]
}
