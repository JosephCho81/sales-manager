/**
 * Analytics 계산 순수 함수
 * JSX 없음 — 마진 집계, 품목별/월별 breakdown 로직만 포함
 *
 * 집계 기준: invoice_month (지급 스케줄 월) — delivery.year_month (납품월)가 아님
 * invoice_month = delivery_date + contract.invoice_month_offset
 */
import { calcMarginFromContract, splitMargin } from '@/lib/margin'
import { shiftMonths } from '@/lib/date'

// ── 타입 ──
export type DeliveryForAnalytics = {
  id: string
  year_month: string        // 납품월 (배송월) — "N월분" 라벨용
  invoice_month: string     // 지급 스케줄 월 — 집계 기준
  product_id: string
  quantity_kg: number
  product: { id: string; name: string; display_name: string; buyer: string } | null
  contract: {
    sell_price: number; cost_price: number
    currency: string; reference_exchange_rate: number | null
  } | null
}

/** commissions 테이블에서 가져오는 커미션 데이터 */
export type CommissionEntry = {
  year_month: string        // 발생 기준월; 지급월 = year_month + 1
  commission_amount: number
  company: string           // '동국제강' | '현대제철'
}

export type MarginTotals = {
  qtyTon: number; sellKrw: number; costKrw: number
  totalMargin: number; a1: number; gm: number; rs: number
  /** AL35B 전용: 금화 매출 (화림 원가 + 금화 마진1/3) */
  geumhwaSellKrw: number
  /** 커미션 합계 (지급월 기준) */
  commissionTotal: number
}

export type ProductRow = MarginTotals & {
  productId: string; name: string; displayName: string; buyer: string
  deliveryYearMonth: string   // 납품월 — "N월분" 표시용
}

export type MonthlyData = { ym: string } & MarginTotals

// ── 상수 ──
export const PRODUCT_ORDER = ['AL35B', 'AL65B', 'SOGGAE', 'BUNTAN', 'FESI75', 'FESI60', 'AL30']

/** 커미션 지급월 = 발생 기준월 + 1 */
function commissionPaymentMonth(ym: string): string {
  return shiftMonths(ym, 1)
}

// ── 집계 함수 ──
export function computeMargins(
  deliveries: DeliveryForAnalytics[],
  commissions: CommissionEntry[],
  fromYM?: string,
  toYM?: string,
): MarginTotals {
  let qtyTon = 0, sellKrw = 0, costKrw = 0, totalMargin = 0, a1 = 0, gm = 0, rs = 0
  let geumhwaSellKrw = 0
  for (const d of deliveries) {
    if (!d.contract) continue
    const inRange = !fromYM || (d.invoice_month >= fromYM && d.invoice_month <= toYM!)
    if (!inRange) continue

    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    qtyTon      += m.quantity_ton
    sellKrw     += m.sell_price_krw  * m.quantity_ton
    costKrw     += m.cost_price_krw  * m.quantity_ton
    totalMargin += m.total_margin
    a1          += m.korea_a1
    gm          += m.geumhwa
    rs          += m.raseong
    if (d.product?.name.toUpperCase() === 'AL35B') {
      geumhwaSellKrw += m.cost_price_krw * m.quantity_ton + m.geumhwa
    }
  }

  // 커미션 (지급월 기준으로 집계)
  let commissionTotal = 0
  for (const c of commissions) {
    const payMonth = commissionPaymentMonth(c.year_month)
    if (!fromYM || (payMonth >= fromYM && payMonth <= toYM!)) {
      const sp = splitMargin(c.commission_amount)
      commissionTotal += c.commission_amount
      totalMargin += c.commission_amount
      a1 += sp.korea_a1; gm += sp.geumhwa; rs += sp.raseong
    }
  }

  return { qtyTon, sellKrw, costKrw, totalMargin, a1, gm, rs, geumhwaSellKrw, commissionTotal }
}

export function buildProductRows(
  deliveries: DeliveryForAnalytics[],
  fromYM?: string,
  toYM?: string,
): ProductRow[] {
  const map = new Map<string, ProductRow>()
  for (const d of deliveries) {
    if (!d.contract || !d.product) continue
    const inRange = !fromYM || (d.invoice_month >= fromYM && d.invoice_month <= toYM!)
    if (!inRange) continue

    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    const isAL35 = d.product.name.toUpperCase() === 'AL35B'
    const gmSell = isAL35 ? m.cost_price_krw * m.quantity_ton + m.geumhwa : 0

    const key = `${d.product_id}_${d.year_month}`
    const ex = map.get(key)
    if (ex) {
      ex.qtyTon      += m.quantity_ton
      ex.sellKrw     += m.sell_price_krw * m.quantity_ton
      ex.costKrw     += m.cost_price_krw * m.quantity_ton
      ex.totalMargin += m.total_margin
      ex.a1 += m.korea_a1; ex.gm += m.geumhwa; ex.rs += m.raseong
      ex.geumhwaSellKrw += gmSell
    } else {
      map.set(key, {
        productId: d.product_id, name: d.product.name,
        displayName: d.product.display_name, buyer: d.product.buyer,
        deliveryYearMonth: d.year_month,
        qtyTon:    m.quantity_ton,
        sellKrw:   m.sell_price_krw * m.quantity_ton,
        costKrw:   m.cost_price_krw * m.quantity_ton,
        totalMargin: m.total_margin,
        a1: m.korea_a1,
        gm: m.geumhwa,
        rs: m.raseong,
        geumhwaSellKrw: gmSell,
        commissionTotal: 0,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const ai = PRODUCT_ORDER.indexOf(a.name), bi = PRODUCT_ORDER.indexOf(b.name)
    const nameOrder = (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    if (nameOrder !== 0) return nameOrder
    return a.deliveryYearMonth.localeCompare(b.deliveryYearMonth)
  })
}

export function buildMonthlyData(
  deliveries: DeliveryForAnalytics[],
  commissions: CommissionEntry[],
  fromYM: string,
  toYM: string,
): MonthlyData[] {
  const months: string[] = []
  const cur = new Date(fromYM + '-02')
  const end = new Date(toYM   + '-02')
  while (cur <= end) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return months.map(ym => {
    let qtyTon = 0, sellKrw = 0, costKrw = 0, totalMargin = 0, a1 = 0, gm = 0, rs = 0
    let geumhwaSellKrw = 0
    for (const d of deliveries) {
      if (!d.contract || d.invoice_month !== ym) continue
      const m = calcMarginFromContract(d.contract, d.quantity_kg)
      qtyTon      += m.quantity_ton
      sellKrw     += m.sell_price_krw * m.quantity_ton
      costKrw     += m.cost_price_krw * m.quantity_ton
      totalMargin += m.total_margin
      a1 += m.korea_a1; gm += m.geumhwa; rs += m.raseong
      if (d.product?.name.toUpperCase() === 'AL35B') {
        geumhwaSellKrw += m.cost_price_krw * m.quantity_ton + m.geumhwa
      }
    }

    // 커미션 (지급월 기준)
    let commissionTotal = 0
    for (const c of commissions) {
      if (commissionPaymentMonth(c.year_month) === ym) {
        const sp = splitMargin(c.commission_amount)
        commissionTotal += c.commission_amount
        totalMargin += c.commission_amount
        a1 += sp.korea_a1; gm += sp.geumhwa; rs += sp.raseong
      }
    }

    return { ym, qtyTon, sellKrw, costKrw, totalMargin, a1, gm, rs, geumhwaSellKrw, commissionTotal }
  })
}
