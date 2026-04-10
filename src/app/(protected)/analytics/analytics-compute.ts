/**
 * Analytics 계산 순수 함수
 * JSX 없음 — 마진 집계, 품목별/월별 breakdown 로직만 포함
 *
 * 집계 기준: invoice_month (지급 스케줄 월) — delivery.year_month (납품월)가 아님
 * invoice_month = delivery_date + contract.invoice_month_offset
 */
import { calcMarginFromContract, calcAddlMargin, splitMargin } from '@/lib/margin'
import { shiftMonths } from '@/lib/date'

// ── 타입 ──
export type DeliveryForAnalytics = {
  id: string
  year_month: string        // 납품월 (배송월) — "N월분" 라벨용
  invoice_month: string     // 지급 스케줄 월 — 집계 기준
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

/** hyundai_transactions에서 가져오는 부족분 커미션 데이터 */
export type ShortageTransaction = {
  year_month: string        // 발생 기준월 (납품월); 지급월 = year_month + 1
  commission_amount: number
}

export type MarginTotals = {
  qtyTon: number; sellKrw: number; costKrw: number
  totalMargin: number; a1: number; gm: number; rs: number
  /** AL35B 전용: 금화 매출 (화림 원가 + 금화 마진1/3) */
  geumhwaSellKrw: number
  /** AL30 부족분 커미션 합계 (지급월 기준) */
  shortageCommission: number
}

export type ProductRow = MarginTotals & {
  productId: string; name: string; displayName: string; buyer: string
  deliveryYearMonth: string   // 납품월 — "N월분" 표시용
  addlMarginTotal: number
}

export type MonthlyData = { ym: string } & MarginTotals

// ── 상수 ──
export const PRODUCT_ORDER = ['AL35B', 'AL65B', 'SOGGAE', 'BUNTAN', 'FESI75', 'FESI60', 'AL30']

/** 부족분 커미션 지급월 = 발생 기준월 + 1 */
function shortagePaymentMonth(ym: string): string {
  return shiftMonths(ym, 1)
}

// ── 집계 함수 ──
export function computeMargins(
  deliveries: DeliveryForAnalytics[],
  shortages: ShortageTransaction[],
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
    if (d.addl_quantity_kg && d.addl_margin_per_ton) {
      const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
      totalMargin += am.total_margin; a1 += am.korea_a1; gm += am.geumhwa; rs += am.raseong
    }
  }

  // 부족분 커미션 (지급월 기준으로 집계)
  let shortageCommission = 0
  for (const s of shortages) {
    const payMonth = shortagePaymentMonth(s.year_month)
    if (!fromYM || (payMonth >= fromYM && payMonth <= toYM!)) {
      const sp = splitMargin(s.commission_amount)
      shortageCommission += s.commission_amount
      totalMargin += s.commission_amount
      a1 += sp.korea_a1; gm += sp.geumhwa; rs += sp.raseong
    }
  }

  return { qtyTon, sellKrw, costKrw, totalMargin, a1, gm, rs, geumhwaSellKrw, shortageCommission }
}

export function buildProductRows(
  deliveries: DeliveryForAnalytics[],
  fromYM?: string,
  toYM?: string,
): ProductRow[] {
  // (product_id, year_month) 복합키로 그룹화 — 같은 품목 다른 배송월을 구분
  const map = new Map<string, ProductRow>()
  for (const d of deliveries) {
    if (!d.contract || !d.product) continue
    const inRange = !fromYM || (d.invoice_month >= fromYM && d.invoice_month <= toYM!)
    if (!inRange) continue

    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    let amTotal = 0, amA1 = 0, amGm = 0, amRs = 0
    if (d.addl_quantity_kg && d.addl_margin_per_ton) {
      const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
      amTotal = am.total_margin; amA1 = am.korea_a1; amGm = am.geumhwa; amRs = am.raseong
    }
    const isAL35 = d.product.name.toUpperCase() === 'AL35B'
    const gmSell = isAL35 ? m.cost_price_krw * m.quantity_ton + m.geumhwa : 0

    const key = `${d.product_id}_${d.year_month}`
    const ex = map.get(key)
    if (ex) {
      ex.qtyTon      += m.quantity_ton
      ex.sellKrw     += m.sell_price_krw * m.quantity_ton
      ex.costKrw     += m.cost_price_krw * m.quantity_ton
      ex.totalMargin += m.total_margin + amTotal
      ex.addlMarginTotal += amTotal
      ex.a1 += m.korea_a1 + amA1; ex.gm += m.geumhwa + amGm; ex.rs += m.raseong + amRs
      ex.geumhwaSellKrw += gmSell
    } else {
      map.set(key, {
        productId: d.product_id, name: d.product.name,
        displayName: d.product.display_name, buyer: d.product.buyer,
        deliveryYearMonth: d.year_month,
        qtyTon:    m.quantity_ton,
        sellKrw:   m.sell_price_krw * m.quantity_ton,
        costKrw:   m.cost_price_krw * m.quantity_ton,
        totalMargin: m.total_margin + amTotal,
        addlMarginTotal: amTotal,
        a1: m.korea_a1 + amA1,
        gm: m.geumhwa  + amGm,
        rs: m.raseong  + amRs,
        geumhwaSellKrw: gmSell,
        shortageCommission: 0,
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
  shortages: ShortageTransaction[],
  fromYM: string,
  toYM: string,
): MonthlyData[] {
  // 범위 내 모든 월 생성 (데이터 없는 월도 포함)
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
      if (d.addl_quantity_kg && d.addl_margin_per_ton) {
        const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
        totalMargin += am.total_margin; a1 += am.korea_a1; gm += am.geumhwa; rs += am.raseong
      }
    }

    // 부족분 커미션 (지급월 기준)
    let shortageCommission = 0
    for (const s of shortages) {
      if (shortagePaymentMonth(s.year_month) === ym) {
        const sp = splitMargin(s.commission_amount)
        shortageCommission += s.commission_amount
        totalMargin += s.commission_amount
        a1 += sp.korea_a1; gm += sp.geumhwa; rs += sp.raseong
      }
    }

    return { ym, qtyTon, sellKrw, costKrw, totalMargin, a1, gm, rs, geumhwaSellKrw, shortageCommission }
  })
}
