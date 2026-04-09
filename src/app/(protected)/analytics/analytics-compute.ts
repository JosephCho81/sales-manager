/**
 * Analytics 계산 순수 함수
 * JSX 없음 — 마진 집계, 품목별/월별 breakdown 로직만 포함
 */
import { calcMarginFromContract, calcAddlMargin } from '@/lib/margin'

// ── 타입 ──
export type DeliveryForAnalytics = {
  id: string
  year_month: string
  product_id: string
  quantity_kg: number
  addl_quantity_kg: number | null
  addl_margin_per_ton: number | null
  product: { id: string; name: string; display_name: string; buyer: string } | null
  contract: {
    sell_price: number; cost_price: number
    currency: string; reference_exchange_rate: number | null
  } | null
}

export type MarginTotals = {
  qtyTon: number; sellKrw: number; costKrw: number
  totalMargin: number; a1: number; gm: number; rs: number
}

export type ProductRow = MarginTotals & {
  productId: string; name: string; displayName: string; buyer: string
}

export type MonthlyData = { ym: string } & MarginTotals

// ── 상수 ──
export const PRODUCT_ORDER = ['AL35B', 'AL65B', 'SOGGAE', 'BUNTAN', 'FESI75', 'FESI60', 'AL30']

// ── 집계 함수 ──
export function computeMargins(deliveries: DeliveryForAnalytics[]): MarginTotals {
  let qtyTon = 0, sellKrw = 0, costKrw = 0, totalMargin = 0, a1 = 0, gm = 0, rs = 0
  for (const d of deliveries) {
    if (!d.contract) continue
    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    qtyTon      += m.quantity_ton
    sellKrw     += m.sell_price_krw  * m.quantity_ton
    costKrw     += m.cost_price_krw  * m.quantity_ton
    totalMargin += m.total_margin
    a1          += m.korea_a1
    gm          += m.geumhwa
    rs          += m.raseong
    if (d.addl_quantity_kg && d.addl_margin_per_ton) {
      const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
      totalMargin += am.total_margin; a1 += am.korea_a1; gm += am.geumhwa; rs += am.raseong
    }
  }
  return { qtyTon, sellKrw, costKrw, totalMargin, a1, gm, rs }
}

export function buildProductRows(deliveries: DeliveryForAnalytics[]): ProductRow[] {
  const map = new Map<string, ProductRow>()
  for (const d of deliveries) {
    if (!d.contract || !d.product) continue
    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    let amTotal = 0, amA1 = 0, amGm = 0, amRs = 0
    if (d.addl_quantity_kg && d.addl_margin_per_ton) {
      const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
      amTotal = am.total_margin; amA1 = am.korea_a1; amGm = am.geumhwa; amRs = am.raseong
    }
    const ex = map.get(d.product_id)
    if (ex) {
      ex.qtyTon      += m.quantity_ton
      ex.sellKrw     += m.sell_price_krw * m.quantity_ton
      ex.costKrw     += m.cost_price_krw * m.quantity_ton
      ex.totalMargin += m.total_margin + amTotal
      ex.a1 += m.korea_a1 + amA1; ex.gm += m.geumhwa + amGm; ex.rs += m.raseong + amRs
    } else {
      map.set(d.product_id, {
        productId: d.product_id, name: d.product.name,
        displayName: d.product.display_name, buyer: d.product.buyer,
        qtyTon: m.quantity_ton,
        sellKrw: m.sell_price_krw * m.quantity_ton,
        costKrw: m.cost_price_krw * m.quantity_ton,
        totalMargin: m.total_margin + amTotal,
        a1: m.korea_a1 + amA1, gm: m.geumhwa + amGm, rs: m.raseong + amRs,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ai = PRODUCT_ORDER.indexOf(a.name), bi = PRODUCT_ORDER.indexOf(b.name)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })
}

export function buildMonthlyData(deliveries: DeliveryForAnalytics[], fromYM: string, toYM: string): MonthlyData[] {
  // 범위 내 모든 월 생성 (데이터 없는 월도 포함)
  const months: string[] = []
  const cur = new Date(fromYM + '-02')
  const end = new Date(toYM   + '-02')
  while (cur <= end) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  const byMonth = new Map<string, DeliveryForAnalytics[]>(months.map(ym => [ym, []]))
  for (const d of deliveries) byMonth.get(d.year_month)?.push(d)
  return months.map(ym => ({ ym, ...computeMargins(byMonth.get(ym) ?? []) }))
}
