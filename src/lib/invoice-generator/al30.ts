/**
 * AL-30 (현대제철 ← 화림)
 *
 * 계산서 구조:
 *   - 현대→한국에이원 역발행: 10일 단위 3구간, 익익월말 지급
 *   - 한국에이원→화림: 당월 합산 1장, 익월1일 발행, 익익월말 지급
 *   - 커미션(금화/라성): 익익월말
 *
 * 날짜 기준: 납품월(deliveryYM)
 */
import { shiftMonths, monthEnd, workingDayFrom, workingDayOnOrAfter } from '@/lib/date'
import { splitMargin } from '@/lib/margin'
import { makeInvoice, calcCombinedMargin, calcVat } from './utils'
import type { DeliveryForInvoice, InvoiceToCreate } from './types'

/** 감가 차감분 — 금액과 귀속 납품월(메모 표기용) */
export type DepSlice = { amount: number; originYMs: string[] }
const NO_DEP: DepSlice = { amount: 0, originYMs: [] }

const originLabel = (ymList: string[]) =>
  ymList.map(y => `${parseInt(y.slice(5, 7))}월`).join('·')

/**
 * 감가로 배분액이 움직인 커미션의 부가세.
 * 매출·매입 계산서와 같은 원칙 — 감가 반영 후 공급가에 일괄 10%를 매기면 실제 계산서와 1원 어긋난다.
 * (5,179,833 → 517,983, 감가분 18,726 → 1,873 ⇒ 516,110. 일괄 계산은 516,111)
 */
function commVat(base: number, final: number, to: string): number | undefined {
  const delta = final - base
  if (delta === 0) return undefined
  return calcVat(base, to) + (delta > 0 ? calcVat(delta, to) : -calcVat(-delta, to))
}

export function genAL30(
  deliveries: DeliveryForInvoice[],
  ym: string,
  /** 이 납품월 매입(화림) 계산서에서 차감할 감가 — 현대 감액분 회수 */
  costDep: DepSlice = NO_DEP,
  /**
   * 이 납품월 매출(현대 역발행) 계산서에서 차감할 감가.
   * 현대는 감가를 통보 없이 반영해 역발행하므로 실제 세금계산서가 이미 감액된 금액이다.
   * 월 3장 중 마지막 구간에서만 차감하고, 그만큼 마진(=커미션 3사 배분)도 줄어든다.
   */
  salesDep: DepSlice = NO_DEP,
): InvoiceToCreate[] {
  const pid        = deliveries[0].product_id
  const deliveryYM = deliveries[0].year_month
  const dNextM     = shiftMonths(deliveryYM, 1)
  const dNext2M    = shiftMonths(deliveryYM, 2)

  // 워킹데이 보정
  const wB10    = workingDayOnOrAfter(deliveryYM, 10)
  const wB20    = workingDayOnOrAfter(deliveryYM, 20)
  const wBEnd   = workingDayFrom(monthEnd(deliveryYM))
  const wDue1N  = workingDayOnOrAfter(dNextM, 1)
  const wEnd2M  = workingDayFrom(monthEnd(dNext2M))
  const wB1N2   = workingDayOnOrAfter(dNext2M, 1)

  // 10일 단위 3구간 분류
  const periods: Array<{ label: string; days: DeliveryForInvoice[]; basisDate: string }> = [
    { label: '1~10일',    days: [], basisDate: wB10  },
    { label: '11~20일',   days: [], basisDate: wB20  },
    { label: '21일~말일', days: [], basisDate: wBEnd },
  ]
  for (const d of deliveries) {
    const day = d.delivery_date ? parseInt(d.delivery_date.slice(8, 10)) : 15
    if (day <= 10)      periods[0].days.push(d)
    else if (day <= 20) periods[1].days.push(d)
    else                periods[2].days.push(d)
  }

  const result: InvoiceToCreate[] = []
  let totalCost    = 0
  let totalGeumhwa = 0
  let totalRaseong = 0
  // 감가 반영 전 배분액 — 커미션 부가세를 라인별로 계산하기 위해 따로 누적
  let baseGeumhwa  = 0
  let baseRaseong  = 0

  // 매출 감가는 월 마지막 발행 구간 1장에만 반영 (분산하면 라인별 부가세가 실제와 어긋남)
  const active   = periods.filter(p => p.days.length > 0)
  const lastSale = active[active.length - 1]

  for (const period of active) {
    const ids       = period.days.map(d => d.id)
    const sellTotal = period.days.reduce((s, d) => s + d.contract.sell_price * d.quantity_kg / 1000, 0)
    const costTotal = period.days.reduce((s, d) => s + d.contract.cost_price * d.quantity_kg / 1000, 0)
    const sDep      = period === lastSale ? salesDep.amount : 0

    // 커미션은 그달 실제 계산서 기준 마진(매출 − 매입)의 1/3이어야 한다.
    // 매출 감액월은 3사가 함께 부담(−), 매입 회수월은 함께 회수(+) → 최종 상쇄
    const adjust = period === lastSale ? costDep.amount - sDep : 0
    const cm = calcCombinedMargin(period.days)
    const { geumhwa, raseong } = adjust !== 0 ? splitMargin(cm.totalMargin + adjust) : cm

    totalCost    += costTotal
    totalGeumhwa += geumhwa
    totalRaseong += raseong
    baseGeumhwa  += cm.geumhwa
    baseRaseong  += cm.raseong

    // 현대→한국에이원 역발행 (10일 단위, 익익월말 지급)
    result.push(makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '현대제철', to: '(주)한국에이원', supply: sellTotal - sDep, vat: true,
      // 감가 라인의 부가세는 감가액 기준으로 따로 반올림해 뺀다 — 차감 후 공급가에
      // 일괄 10%를 다시 매기면 현대 실입금액과 1원 어긋난다
      vatOverride: sDep > 0
        ? calcVat(Math.round(sellTotal), '현대제철') - calcVat(sDep, '현대제철')
        : undefined,
      basisDate: period.basisDate, deadline: period.basisDate,
      paymentDue: wEnd2M,
      type: 'sales',
      memo: sDep > 0
        ? `현대제철 역발행 ${period.label} — ${originLabel(salesDep.originYMs)}분 감가 ${sDep.toLocaleString('ko-KR')}원 반영 발행(현대 통보 없이 감액), 익익월말 지급 ${wEnd2M}`
        : `현대제철 역발행 ${period.label} — 익익월말 지급 ${wEnd2M}`,
    }))
  }

  // 한국에이원→화림: 당월 합산 1장, 익익월말 지급
  if (totalCost > 0) {
    const dep = costDep.amount
    const origin = originLabel(costDep.originYMs)
    result.push(makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid,
      deliveryIds: deliveries.map(d => d.id),
      from: '(주)한국에이원', to: '화림', supply: totalCost - dep, vat: true,
      // 감가 라인의 VAT는 반드시 감가액 기준으로 따로 계산해 뺀다.
      // 차감된 공급가액에 일괄 10%를 다시 매기면 현대 미입금액과 1원 어긋난다
      // (56,179×0.1 = 5,617.9 — 라인별 반올림 5,618이 실제 차감액)
      vatOverride: dep > 0
        ? calcVat(Math.round(totalCost), '화림') - calcVat(dep, '화림')
        : undefined,
      basisDate: wBEnd, deadline: wDue1N, paymentDue: wEnd2M,
      type: 'cost',
      memo: dep > 0
        ? `(주)한국에이원→화림 당월 합산 — ${origin}분 감가 ${dep.toLocaleString('ko-KR')}원 차감(현대 미입금분 회수), 익익월말 지급`
        : '(주)한국에이원→화림 당월 합산 — 익월1일 발행, 익익월말 지급',
    }))
  }

  // 커미션 (익익월말) — 감가로 마진이 움직였으면 그 사실을 memo에 남긴다.
  // 금액만 달라지고 이유가 없으면 담당자가 계산 오류로 오인한다
  const commNotes: string[] = []
  if (salesDep.amount > 0) {
    commNotes.push(`${originLabel(salesDep.originYMs)}분 감가 ${salesDep.amount.toLocaleString('ko-KR')}원 차감한 마진 기준 (3사 분담)`)
  }
  if (costDep.amount > 0) {
    commNotes.push(`${originLabel(costDep.originYMs)}분 감가 ${costDep.amount.toLocaleString('ko-KR')}원 회수분 포함한 마진 기준 (3사 회수)`)
  }
  const commNote = commNotes.length > 0 ? ` — ${commNotes.join(' / ')}` : ''

  if (totalGeumhwa > 0) {
    result.push(
      makeInvoice({
        yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid,
        deliveryIds: deliveries.map(d => d.id),
        from: '(주)한국에이원', to: '금화', supply: totalGeumhwa, vat: true,
        vatOverride: commVat(baseGeumhwa, totalGeumhwa, '금화'),
        basisDate: wB1N2, deadline: wEnd2M, paymentDue: wEnd2M,
        type: 'commission', memo: `금화 커미션 1/3${commNote} — 익익월말`,
      }),
      makeInvoice({
        yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid,
        deliveryIds: deliveries.map(d => d.id),
        from: '(주)한국에이원', to: '(주)나성', supply: totalRaseong, vat: true,
        vatOverride: commVat(baseRaseong, totalRaseong, '(주)나성'),
        basisDate: wB1N2, deadline: wEnd2M, paymentDue: wEnd2M,
        type: 'commission', memo: `(주)나성 커미션 (나머지)${commNote} — 익익월말`,
      }),
    )
  }

  return result
}
