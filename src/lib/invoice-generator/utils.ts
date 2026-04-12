/**
 * 계산서 생성 공통 헬퍼
 * - makeInvoice: InvoiceToCreate 생성
 * - calcCombinedMargin: 마진 합산 + 3사 배분
 * - separateALMargins: AL35B 전용 기본 마진 계산
 */
import { calcMarginFromContract, splitMargin } from '@/lib/margin'
import type { DeliveryForInvoice, InvoiceToCreate, InvoiceType } from './types'

export function makeInvoice(p: {
  yearMonth: string
  deliveryYearMonth: string
  productId: string
  deliveryIds: string[]
  from: string
  to: string
  supply: number
  vat: boolean
  basisDate: string
  deadline: string
  paymentDue: string
  type: InvoiceType
  memo: string
}): InvoiceToCreate {
  const supply = Math.round(p.supply)
  const vatAmt = p.vat ? Math.round(supply * 0.1) : 0
  return {
    year_month: p.yearMonth,
    delivery_year_month: p.deliveryYearMonth,
    product_id: p.productId,
    delivery_ids: p.deliveryIds,
    from_company: p.from,
    to_company: p.to,
    supply_amount: supply,
    vat_amount: vatAmt,
    total_amount: supply + vatAmt,
    invoice_basis_date: p.basisDate,
    issue_deadline: p.deadline,
    payment_due_date: p.paymentDue,
    is_paid: false,
    invoice_type: p.type,
    memo: p.memo,
  }
}

/** deliveries 배열의 마진 합산 후 3사 배분 반환 */
export function calcCombinedMargin(deliveries: DeliveryForInvoice[]) {
  let totalMargin = 0
  for (const d of deliveries) {
    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    totalMargin += m.total_margin
  }
  return { totalMargin, ...splitMargin(totalMargin) }
}

/** AL35B 전용: 전체 마진 → 3사 배분 */
export function separateALMargins(deliveries: DeliveryForInvoice[]) {
  let mainTotal = 0
  for (const d of deliveries) {
    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    mainTotal += m.total_margin
  }
  return { main: { total: mainTotal, ...splitMargin(mainTotal) } }
}
