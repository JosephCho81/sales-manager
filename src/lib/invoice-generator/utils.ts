/**
 * 계산서 생성 공통 헬퍼
 * - makeInvoice: InvoiceToCreate 생성
 * - calcCombinedMargin: 마진 합산 + 3사 배분
 * - separateALMargins: AL35B 전용 기본 마진 계산
 */
import { calcMarginFromContract, splitMargin } from '@/lib/margin'
import type { DeliveryForInvoice, InvoiceToCreate, InvoiceType } from './types'

/**
 * 거래처별 부가세 원단위 미만 처리 관례 (실제 세금계산서와 1원 일치).
 * 기본은 반올림(동국제강 입금액 기준). 동창은 절사(버림).
 */
const VAT_FLOOR_COMPANIES = new Set(['동창'])

export function calcVat(supply: number, counterparty: string): number {
  return VAT_FLOOR_COMPANIES.has(counterparty)
    ? Math.floor(supply * 0.1)
    : Math.round(supply * 0.1)
}

export function makeInvoice(p: {
  yearMonth: string
  deliveryYearMonth: string
  productId: string | null
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
  /** 라인별 VAT 합산 등 일괄 10% 계산과 다른 경우 명시 (실제 세금계산서 일치용) */
  vatOverride?: number
}): InvoiceToCreate {
  const supply = Math.round(p.supply)
  // 상대 거래처(한국에이원이 아닌 쪽) 기준으로 부가세 끝자리 처리 분기
  const counterparty = p.from === '(주)한국에이원' ? p.to : p.from
  const vatAmt = p.vat ? (p.vatOverride ?? calcVat(supply, counterparty)) : 0
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
