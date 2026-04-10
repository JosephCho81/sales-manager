/**
 * AL-30 (현대제철 ← 화림)
 * - 10일 단위 3구간 역발행, 60일 어음
 * - 화림→한국에이원: 당월 합산 1장, 익월1일 발행(계산서 날짜=당월말), 익익월말 지급
 * - 커미션: 익익월10일
 */
import { shiftMonths, monthEnd, nthDay, addDays } from '@/lib/date'
import { makeInvoice, calcCombinedMargin } from './utils'
import type { DeliveryForInvoice, InvoiceToCreate } from './types'

export function genAL30(
  deliveries: DeliveryForInvoice[],
  ym: string
): InvoiceToCreate[] {
  const pid    = deliveries[0].product_id
  const deliveryYM = deliveries[0].year_month
  const nextM  = shiftMonths(ym, 1)
  const next2M = shiftMonths(ym, 2)

  // 10일 단위 3구간으로 그룹
  const periods: Array<{ label: string; days: DeliveryForInvoice[]; basisDate: string }> = [
    { label: '1~10일',   days: [], basisDate: nthDay(ym, 10) },
    { label: '11~20일',  days: [], basisDate: nthDay(ym, 20) },
    { label: '21일~말일', days: [], basisDate: monthEnd(ym)  },
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

  for (const period of periods) {
    if (period.days.length === 0) continue
    const ids      = period.days.map(d => d.id)
    const sellTotal = period.days.reduce((s, d) => s + d.contract.sell_price * d.quantity_kg / 1000, 0)
    const costTotal = period.days.reduce((s, d) => s + d.contract.cost_price * d.quantity_kg / 1000, 0)
    const billDue  = addDays(period.basisDate, 60)
    const { geumhwa, raseong } = calcCombinedMargin(period.days)

    totalCost    += costTotal
    totalGeumhwa += geumhwa
    totalRaseong += raseong

    // 현대→한국에이원 역발행 (10일 단위, 60일 어음)
    result.push(makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '현대제철', to: '한국에이원', supply: sellTotal, vat: true,
      basisDate: period.basisDate, deadline: period.basisDate,
      paymentDue: billDue,
      type: 'sales',
      memo: `현대제철 역발행 ${period.label} — 60일 어음 만기 ${billDue}`,
    }))
  }

  // 화림→한국에이원: 당월 합산 1장, 익익월1일 지급
  if (totalCost > 0) {
    result.push(makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: deliveries.map(d => d.id),
      from: '한국에이원', to: '화림', supply: totalCost, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: monthEnd(next2M),
      type: 'cost',
      memo: '한국에이원→화림 당월 합산 1장 — 익월1일 발행, 익익월말 지급',
    }))
  }

  // 커미션 — 익익월10일
  if (totalGeumhwa > 0) {
    result.push(
      makeInvoice({
        yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: deliveries.map(d => d.id),
        from: '한국에이원', to: '금화', supply: totalGeumhwa, vat: true,
        basisDate: nthDay(next2M, 1), deadline: nthDay(next2M, 10), paymentDue: nthDay(next2M, 10),
        type: 'commission', memo: '금화 커미션 1/3 — 익익월10일',
      }),
      makeInvoice({
        yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: deliveries.map(d => d.id),
        from: '한국에이원', to: '라성', supply: totalRaseong, vat: true,
        basisDate: nthDay(next2M, 1), deadline: nthDay(next2M, 10), paymentDue: nthDay(next2M, 10),
        type: 'commission', memo: '라성 커미션 (나머지) — 익익월10일',
      }),
    )
  }

  return result
}
