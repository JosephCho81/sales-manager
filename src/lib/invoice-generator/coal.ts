/**
 * 소괴탄(SOGGAE) / 분탄(BUNTAN)
 *
 * 감가(depreciation_amount) 반영:
 *   청구금액 = quantity_kg × 단가 / 1000 − depreciation_amount(원)
 *
 * 소괴탄: 동국→한국에이원 역발행 (VAT 없음), 익월1일 발행, 익월10일 대금; 커미션은 VAT 10%
 *        매입처=렘코. 동국 감가는 **통과형** — 동국이 감액 역발행해 매출·마진·커미션이 그달에
 *        줄고, 합의한 회수 납품월의 렘코 매입에서 되돌아온다 (docs 참조: AL30과 같은 구조).
 * 분탄:  동창→한국에이원→렘코 (VAT 10%), 익월1일 동시 발행, 익월10일 대금
 *        (동국제강 없음. 매입처=동창, 매출처=렘코 역발행)
 *        월별 감가(costDep)는 **보관형** — 동창 매입 계산서만 차감하고 렘코 매출·커미션은
 *        총액 기준 유지(렘코 상장 총액매출 방침). 감가 금액은 3사 배분에서 제외해 보관,
 *        계약 종료 후 렘코 반환.
 * 커미션(금화/나성): 익월10일 (공통). 대금(매출·매입)의 익월10일과 달리
 *   지급일이 휴일이면 **앞당겨** 지급 — workingDayOnOrBefore
 *
 * 보관형/통과형 구분은 `DepSlice.marginAmount`가 담는다 (0이면 배분 불변).
 */
import { splitMargin } from '@/lib/margin'
import { shiftMonths, monthEnd, workingDayFrom, workingDayOnOrAfter, workingDayOnOrBefore } from '@/lib/date'
import { makeInvoice, calcVat, commVat, originLabel } from './utils'
import { NO_DEP, type DeliveryForInvoice, type DepSlice, type InvoiceToCreate } from './types'

const krw = (n: number) => n.toLocaleString('ko-KR')

/** 매출 감액 / 매입 회수 사실을 커미션 memo에 남긴다 — 금액만 달라지면 계산 오류로 오인한다 */
function commissionNote(costDep: DepSlice, salesDep: DepSlice): string {
  const notes: string[] = []
  if (salesDep.marginAmount > 0) {
    notes.push(`${originLabel(salesDep.originYMs)}분 감가 ${krw(salesDep.marginAmount)}원 차감한 마진 기준 (3사 분담)`)
  }
  if (costDep.marginAmount > 0) {
    notes.push(`${originLabel(costDep.originYMs)}분 감가 ${krw(costDep.marginAmount)}원 회수분 포함한 마진 기준 (3사 회수)`)
  }
  return notes.length > 0 ? ` — ${notes.join(' / ')}` : ''
}

export function genSoggae(
  deliveries: DeliveryForInvoice[],
  ym: string,
  /** 이 납품월 매입(렘코) 계산서에서 차감할 감가 — 동국 감액분 회수 */
  costDep: DepSlice = NO_DEP,
  /** 이 납품월 매출(동국 역발행) 계산서가 감액 발행된 금액 */
  salesDep: DepSlice = NO_DEP,
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

  // 커미션은 그달 실제 계산서 기준 마진(매출 − 매입)의 1/3.
  // 매출 감액월은 3사가 함께 부담(−), 매입 회수월은 함께 회수(+) → 최종 상쇄
  const baseMargin = Math.round(sellTotal - costTotal)
  const adjust     = costDep.marginAmount - salesDep.marginAmount
  const base       = splitMargin(baseMargin)
  const { geumhwa, raseong } = adjust !== 0 ? splitMargin(baseMargin + adjust) : base

  // 워킹데이 보정
  const wBasisM = workingDayFrom(monthEnd(deliveryYM))
  const wDue1N  = workingDayOnOrAfter(nextM, 1)
  const wDue10N = workingDayOnOrAfter(nextM, 10)
  // 커미션 지급일: 익월10일, 휴일이면 앞당김
  const wComm10N = workingDayOnOrBefore(nextM, 10)

  const commNote = commissionNote(costDep, salesDep)

  return [
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '(주)한국에이원', supply: sellTotal - salesDep.amount, vat: false,
      basisDate: wBasisM, deadline: wDue1N, paymentDue: wDue10N,
      type: 'sales',
      memo: salesDep.amount > 0
        ? `동국제강 역발행 — 매출 (VAT없음), ${originLabel(salesDep.originYMs)}분 감가 ${krw(salesDep.amount)}원 반영 발행`
        : '동국제강 역발행 — 매출 (VAT없음)',
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '렘코', supply: costTotal - costDep.amount, vat: false,
      basisDate: wBasisM, deadline: wDue1N, paymentDue: wDue10N,
      type: 'cost',
      memo: costDep.amount > 0
        ? `렘코 원가 (VAT없음) — ${originLabel(costDep.originYMs)}분 감가 ${krw(costDep.amount)}원 차감`
        : '렘코 원가 (VAT없음)',
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '금화', supply: geumhwa, vat: true,
      vatOverride: commVat(base.geumhwa, geumhwa, '금화'),
      basisDate: wComm10N, deadline: wComm10N, paymentDue: wComm10N,
      type: 'commission', memo: `금화 커미션 1/3${commNote}`,
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '(주)나성', supply: raseong, vat: true,
      vatOverride: commVat(base.raseong, raseong, '(주)나성'),
      basisDate: wComm10N, deadline: wComm10N, paymentDue: wComm10N,
      type: 'commission', memo: `(주)나성 커미션 (나머지)${commNote}`,
    }),
  ]
}

export function genBuntan(
  deliveries: DeliveryForInvoice[],
  ym: string,
  /**
   * 이 납품월 매입(동창) 계산서에서 차감할 감가.
   * 보관형이면 marginAmount=0이라 렘코 매출·커미션은 총액 기준 그대로 유지된다.
   * `vatActual`은 동창 실물 계산서의 부가세 — 있으면 계산값을 덮어쓴다.
   */
  costDep: DepSlice = NO_DEP,
  /** 이 납품월 매출(렘코 역발행) 계산서가 감액 발행된 금액. 보관형 분탄은 0 */
  salesDep: DepSlice = NO_DEP,
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

  const baseMargin = Math.round(sellTotal - costTotal)
  const adjust     = costDep.marginAmount - salesDep.marginAmount
  const base       = splitMargin(baseMargin)
  const { geumhwa, raseong } = adjust !== 0 ? splitMargin(baseMargin + adjust) : base

  // 워킹데이 보정
  const wBasisM = workingDayFrom(monthEnd(deliveryYM))
  const wDue1N  = workingDayOnOrAfter(nextM, 1)
  const wDue10N = workingDayOnOrAfter(nextM, 10)
  // 커미션 지급일: 익월10일, 휴일이면 앞당김
  const wComm10N = workingDayOnOrBefore(nextM, 10)

  const costVatActual = costDep.vatActual ?? null
  const commNote      = commissionNote(costDep, salesDep)

  return [
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '렘코', to: '(주)한국에이원', supply: sellTotal - salesDep.amount, vat: true,
      // 감가 라인의 VAT는 감가액 기준으로 따로 계산해 뺀다 (차감 후 일괄 10%는 1원 어긋남)
      vatOverride: salesDep.amount > 0
        ? calcVat(Math.round(sellTotal), '렘코') - calcVat(salesDep.amount, '렘코')
        : undefined,
      basisDate: wBasisM, deadline: wDue1N, paymentDue: wDue10N,
      type: 'sales',
      memo: salesDep.amount > 0
        ? `렘코 역발행 — 매출 (VAT10%), ${originLabel(salesDep.originYMs)}분 감가 ${krw(salesDep.amount)}원 반영 발행`
        : '렘코 역발행 — 매출 (VAT10%), 익월1일 동시 발행',
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '동창', supply: costTotal - costDep.amount, vat: true,
      // 동창 세금계산서는 기본적으로 라인별(매입 총액 + 감가 마이너스) VAT 절사 후 합산 —
      // 차감된 공급가액에 일괄 10% 절사하면 1원 어긋남 (2026-06 납품분 실계산서로 확인).
      // 다만 이 관례가 달마다 흔들려(2026-07 납품분은 일괄 절사가 실물) 공식으로 못 맞춘다.
      // 실물 세액이 입력돼 있으면 그 값이 무조건 이긴다 — 계산서는 실물과 1원까지 같아야 한다
      vatOverride: costVatActual ?? (costDep.amount > 0
        ? calcVat(Math.round(costTotal), '동창') - calcVat(costDep.amount, '동창')
        : undefined),
      basisDate: wBasisM, deadline: wDue1N, paymentDue: wDue10N,
      type: 'cost',
      memo: costDep.amount > 0
        ? `(주)한국에이원→동창 — 매입 (VAT10%), 월감가 ${krw(costDep.amount)}원 차감${costVatActual !== null ? ' (부가세 실계산서 값)' : ''}`
        : '(주)한국에이원→동창 — 매입 (VAT10%), 익월1일 동시 발행',
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '금화', supply: geumhwa, vat: true,
      vatOverride: commVat(base.geumhwa, geumhwa, '금화'),
      basisDate: wComm10N, deadline: wComm10N, paymentDue: wComm10N,
      type: 'commission', memo: `금화 커미션 1/3${commNote}`,
    }),
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '(주)한국에이원', to: '(주)나성', supply: raseong, vat: true,
      vatOverride: commVat(base.raseong, raseong, '(주)나성'),
      basisDate: wComm10N, deadline: wComm10N, paymentDue: wComm10N,
      type: 'commission', memo: `(주)나성 커미션 (나머지)${commNote}`,
    }),
  ]
}
