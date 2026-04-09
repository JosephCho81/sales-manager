/**
 * 소괴탄 / 분탄 (동국제강)
 * - 감가(depreciation_kg) 반영: 실 청구 물량 = quantity_kg - depreciation_kg
 * 소괴탄: 동국→한국에이원 역발행 (VAT 없음), 익월1일 발행/익월10일 대금
 * 분탄:  동국→렘코→한국에이원→동창 (VAT 10%), 익월1일 동시 발행/익월10일 대금
 */
import { splitMargin } from '@/lib/margin'
import { shiftMonths, monthEnd, nthDay } from '@/lib/date'
import { makeInvoice } from './utils'
import type { DeliveryForInvoice, InvoiceToCreate } from './types'

function effectiveKg(d: DeliveryForInvoice): number {
  return d.quantity_kg - (d.depreciation_kg ?? 0)
}

export function genSoggae(
  deliveries: DeliveryForInvoice[],
  ym: string
): InvoiceToCreate[] {
  const pid   = deliveries[0].product_id
  const ids   = deliveries.map(d => d.id)
  const nextM = shiftMonths(ym, 1)

  const sellTotal  = deliveries.reduce((s, d) => s + d.contract.sell_price * effectiveKg(d) / 1000, 0)
  const costTotal  = deliveries.reduce((s, d) => s + d.contract.cost_price * effectiveKg(d) / 1000, 0)
  const marginTotal = Math.round(sellTotal - costTotal)
  const { geumhwa, raseong } = splitMargin(marginTotal)

  return [
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '한국에이원', supply: sellTotal, vat: false,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: nthDay(nextM, 10),
      type: 'sales', memo: '동국제강 역발행 — 매출 (VAT없음)',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '렘코', supply: costTotal, vat: false,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: nthDay(nextM, 10),
      type: 'cost', memo: '렘코 원가 (VAT없음)',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '금화', supply: geumhwa, vat: false,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 10), paymentDue: nthDay(nextM, 10),
      type: 'commission', memo: '금화 커미션 1/3',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '라성', supply: raseong, vat: false,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 10), paymentDue: nthDay(nextM, 10),
      type: 'commission', memo: '라성 커미션 (나머지)',
    }),
  ]
}

export function genBuntan(
  deliveries: DeliveryForInvoice[],
  ym: string
): InvoiceToCreate[] {
  const pid   = deliveries[0].product_id
  const ids   = deliveries.map(d => d.id)
  const nextM = shiftMonths(ym, 1)

  const sellTotal  = deliveries.reduce((s, d) => s + d.contract.sell_price * effectiveKg(d) / 1000, 0)
  const costTotal  = deliveries.reduce((s, d) => s + d.contract.cost_price * effectiveKg(d) / 1000, 0)
  const marginTotal = Math.round(sellTotal - costTotal)
  const { geumhwa, raseong } = splitMargin(marginTotal)

  return [
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '렘코', supply: sellTotal, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: nthDay(nextM, 10),
      type: 'sales', memo: '동국→렘코 — 익월1일 동시 발행',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '렘코', to: '한국에이원', supply: sellTotal, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: nthDay(nextM, 10),
      type: 'cost', memo: '렘코→한국에이원 — 익월1일 동시 발행',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '동창', supply: costTotal, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: nthDay(nextM, 10),
      type: 'cost', memo: '한국에이원→동창 — 익월1일 동시 발행',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '금화', supply: geumhwa, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 10), paymentDue: nthDay(nextM, 10),
      type: 'commission', memo: '금화 커미션 1/3',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '라성', supply: raseong, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 10), paymentDue: nthDay(nextM, 10),
      type: 'commission', memo: '라성 커미션 (나머지)',
    }),
  ]
}
