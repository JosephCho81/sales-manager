/**
 * 클라이언트 호환 재집계 함수
 * (필터 활성 시 또는 클라이언트에서 부분 재계산이 필요할 때 사용)
 */
import { calcMarginFromContract, splitMargin } from '@/lib/margin'
import type { DeliveryForAnalytics, CommissionEntry, MarginTotals, ProductRow, MonthlyData } from './analytics-types'
import { PRODUCT_ORDER } from './analytics-types'
import { buildMonthRange } from './analytics-compute'

function zeroTotals(): MarginTotals {
  return { qtyTon: 0, sellKrw: 0, costKrw: 0, totalMargin: 0, a1: 0, gm: 0, rs: 0, geumhwaSellKrw: 0, commissionTotal: 0 }
}

function accDelivery(
  acc: MarginTotals,
  m: { quantity_ton: number; sell_price_krw: number; cost_price_krw: number; total_margin: number; korea_a1: number; geumhwa: number; raseong: number },
  gmSell: number,
  depAmount: number = 0,
): void {
  acc.qtyTon         += m.quantity_ton
  acc.sellKrw        += m.sell_price_krw * m.quantity_ton - depAmount
  acc.costKrw        += m.cost_price_krw * m.quantity_ton - depAmount
  acc.totalMargin    += m.total_margin
  acc.a1             += m.korea_a1
  acc.gm             += m.geumhwa
  acc.rs             += m.raseong
  acc.geumhwaSellKrw += gmSell
}

export function computeMargins(
  deliveries: DeliveryForAnalytics[],
  commissions: CommissionEntry[],
  fromYM?: string,
  toYM?: string,
): MarginTotals {
  const acc = zeroTotals()
  for (const d of deliveries) {
    if (!d.contract) continue
    if (fromYM && (d.invoice_month < fromYM || d.invoice_month > toYM!)) continue
    const m      = calcMarginFromContract(d.contract, d.quantity_kg)
    const isAL35 = d.product?.name.toUpperCase() === 'AL35B'
    const gmSell = isAL35
      ? (m.cost_price_krw + Math.floor((m.sell_price_krw - m.cost_price_krw) / 3)) * m.quantity_ton
      : 0
    accDelivery(acc, m, gmSell, d.depreciation_amount ?? 0)
  }
  for (const c of commissions) {
    if (fromYM && (c.year_month < fromYM || c.year_month > toYM!)) continue
    const sp = splitMargin(c.commission_amount)
    acc.commissionTotal += c.commission_amount
    acc.totalMargin     += c.commission_amount
    acc.a1 += sp.korea_a1; acc.gm += sp.geumhwa; acc.rs += sp.raseong
  }
  return acc
}

export function buildProductRows(
  deliveries: DeliveryForAnalytics[],
  fromYM?: string,
  toYM?: string,
): ProductRow[] {
  const map = new Map<string, ProductRow>()
  for (const d of deliveries) {
    if (!d.contract || !d.product) continue
    if (fromYM && (d.invoice_month < fromYM || d.invoice_month > toYM!)) continue
    const m      = calcMarginFromContract(d.contract, d.quantity_kg)
    const isAL35 = d.product.name.toUpperCase() === 'AL35B'
    const gmSell = isAL35
      ? (m.cost_price_krw + Math.floor((m.sell_price_krw - m.cost_price_krw) / 3)) * m.quantity_ton
      : 0
    const dep    = d.depreciation_amount ?? 0
    const key = `${d.product_id}_${d.year_month}`
    const ex  = map.get(key)
    if (ex) {
      if (ex.sellPricePerTon !== null && ex.sellPricePerTon !== m.sell_price_krw) ex.sellPricePerTon = null
      if (ex.costPricePerTon !== null && ex.costPricePerTon !== m.cost_price_krw) ex.costPricePerTon = null
      accDelivery(ex, m, gmSell, dep)
    } else {
      const row: ProductRow = {
        ...zeroTotals(),
        productId: d.product_id, name: d.product.name,
        displayName: d.product.display_name, buyer: d.product.buyer,
        deliveryYearMonth: d.year_month,
        sellPricePerTon: m.sell_price_krw,
        costPricePerTon: m.cost_price_krw,
      }
      accDelivery(row, m, gmSell, dep)
      map.set(key, row)
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ai = PRODUCT_ORDER.indexOf(a.name), bi = PRODUCT_ORDER.indexOf(b.name)
    const nameOrder = (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    return nameOrder !== 0 ? nameOrder : a.deliveryYearMonth.localeCompare(b.deliveryYearMonth)
  })
}

export function buildMonthlyData(
  deliveries: DeliveryForAnalytics[],
  commissions: CommissionEntry[],
  fromYM: string,
  toYM: string,
): MonthlyData[] {
  const monthlyMap = new Map<string, MarginTotals>()
  for (const d of deliveries) {
    if (!d.contract || d.invoice_month < fromYM || d.invoice_month > toYM) continue
    const m      = calcMarginFromContract(d.contract, d.quantity_kg)
    const isAL35 = d.product?.name.toUpperCase() === 'AL35B'
    const gmSell = isAL35
      ? (m.cost_price_krw + Math.floor((m.sell_price_krw - m.cost_price_krw) / 3)) * m.quantity_ton
      : 0
    const ma     = monthlyMap.get(d.invoice_month) ?? zeroTotals()
    accDelivery(ma, m, gmSell, d.depreciation_amount ?? 0)
    monthlyMap.set(d.invoice_month, ma)
  }
  for (const c of commissions) {
    if (c.year_month < fromYM || c.year_month > toYM) continue
    const sp = splitMargin(c.commission_amount)
    const ma = monthlyMap.get(c.year_month) ?? zeroTotals()
    ma.totalMargin     += c.commission_amount
    ma.a1 += sp.korea_a1; ma.gm += sp.geumhwa; ma.rs += sp.raseong
    ma.commissionTotal += c.commission_amount
    monthlyMap.set(c.year_month, ma)
  }
  return buildMonthRange(fromYM, toYM).map(ym => ({ ym, ...(monthlyMap.get(ym) ?? zeroTotals()) }))
}
