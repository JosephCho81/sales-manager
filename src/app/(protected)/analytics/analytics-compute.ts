/**
 * Analytics 집계 순수 함수 (JSX 없음)
 * 서버 전용: buildAllAnalytics, extractAvailableProducts
 * 클라이언트 호환: computeMargins, buildProductRows, buildMonthlyData
 * 집계 기준: invoice_month (지급 스케줄 월)
 */
import { calcMarginFromContract, splitMargin } from '@/lib/margin'
import { shiftMonths } from '@/lib/date'
import type {
  DeliveryForAnalytics, CommissionEntry, MonthlyDepForAnalytics,
  MarginTotals, ProductRow, MonthlyData,
  CommissionsInPeriod, AllAnalytics,
} from './analytics-types'
import { PRODUCT_ORDER } from './analytics-types'

// ── 내부 헬퍼 ──────────────────────────────────────────────

function zeroTotals(): MarginTotals {
  return { qtyTon: 0, sellKrw: 0, costKrw: 0, totalMargin: 0, a1: 0, gm: 0, rs: 0, geumhwaSellKrw: 0, commissionTotal: 0 }
}
function zeroSplit() {
  return { total: 0, a1: 0, gm: 0, rs: 0, qtyTon: 0, pricePerTon: null as number | null, yearMonth: null as string | null }
}

// depAmount: 소괴탄/분탄 감가 금액(원). 매출·매입 양쪽에서 동일하게 차감 → 마진 불변
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

export function buildMonthRange(fromYM: string, toYM: string): string[] {
  const months: string[] = []
  const cur = new Date(fromYM + '-02')
  const end = new Date(toYM   + '-02')
  while (cur <= end) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

export function extractAvailableProducts(
  deliveries: DeliveryForAnalytics[]
): [string, string][] {
  const seen = new Map<string, string>()
  for (const d of deliveries) {
    if (d.product && !seen.has(d.product.name)) {
      seen.set(d.product.name, d.product.display_name)
    }
  }
  return Array.from(seen.entries()).sort(
    (a, b) =>
      (PRODUCT_ORDER.indexOf(a[0]) < 0 ? 99 : PRODUCT_ORDER.indexOf(a[0])) -
      (PRODUCT_ORDER.indexOf(b[0]) < 0 ? 99 : PRODUCT_ORDER.indexOf(b[0]))
  )
}

export function buildAllAnalytics(
  deliveries: DeliveryForAnalytics[],
  commissions: CommissionEntry[],
  fromYM: string,
  toYM: string,
  monthlyDeps: MonthlyDepForAnalytics[] = [],
): AllAnalytics {
  const totals       = zeroTotals()
  const productMap   = new Map<string, ProductRow>()
  const keyToInvoiceMonth = new Map<string, string>()
  const monthlyMap   = new Map<string, MarginTotals>()
  const productsSeen = new Map<string, string>()
  const dongkukDeliveryYMSet = new Set<string>()
  const hyundaiDeliveryYMSet = new Set<string>()

  // ─── 1) deliveries 단일 패스 ────────────────────────────
  for (const d of deliveries) {
    if (!d.contract) continue
    if (d.product?.name.toUpperCase() === 'AL35B') dongkukDeliveryYMSet.add(d.year_month)
    if (d.product?.buyer === '현대제철')           hyundaiDeliveryYMSet.add(d.year_month)

    // FeSi: 입고 시 입력한 실제 환율(fx_rate)이 있으면 계약 참고환율보다 우선
    const contractForCalc = d.contract.currency === 'USD' && d.fx_rate
      ? { ...d.contract, reference_exchange_rate: d.fx_rate }
      : d.contract
    const m      = calcMarginFromContract(contractForCalc, d.quantity_kg)
    const isAL35 = d.product?.name.toUpperCase() === 'AL35B'
    const gmSell = isAL35
      ? (m.cost_price_krw + Math.floor((m.sell_price_krw - m.cost_price_krw) / 3)) * m.quantity_ton
      : 0
    const dep    = d.depreciation_amount ?? 0

    accDelivery(totals, m, gmSell, dep)

    if (d.product) {
      if (!productsSeen.has(d.product.name)) {
        productsSeen.set(d.product.name, d.product.display_name)
      }
      const key = `${d.product_id}_${d.year_month}`
      keyToInvoiceMonth.set(key, d.invoice_month)
      const ex  = productMap.get(key)
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
          depreciationKrw: 0,
        }
        accDelivery(row, m, gmSell, dep)
        productMap.set(key, row)
      }
    }

    const ma = monthlyMap.get(d.invoice_month) ?? zeroTotals()
    accDelivery(ma, m, gmSell, dep)
    monthlyMap.set(d.invoice_month, ma)
  }

  // ─── 1.5) 월별 감가 (분탄 렘코 미수) — 매출만 차감, 마진 불변 ───
  for (const md of monthlyDeps) {
    const key = `${md.product_id}_${md.year_month}`
    const row = productMap.get(key)
    if (!row) continue // 필터로 제외됐거나 해당 납품 없음
    const amt = Number(md.amount)
    row.sellKrw         -= amt
    row.depreciationKrw += amt
    totals.sellKrw      -= amt
    const im = keyToInvoiceMonth.get(key)
    const ma = im ? monthlyMap.get(im) : undefined
    if (ma) ma.sellKrw -= amt
  }

  // ─── 2) commissions 단일 패스 ───────────────────────────
  const cp: CommissionsInPeriod = {
    dongkuk: zeroSplit(),
    hyundai: zeroSplit(),
    all:     zeroSplit(),
    byMonth: {},
  }
  const commPriceSample: { dongkuk: number; hyundai: number } = { dongkuk: -1, hyundai: -1 }
  const byMonthPriceSample: Record<string, number> = {}

  for (const c of commissions) {
    const key = c.company === '동국제강' ? 'dongkuk' : 'hyundai'
    const sp  = splitMargin(c.commission_amount)

    const isRelevant = key === 'dongkuk'
      ? dongkukDeliveryYMSet.has(c.year_month)
      : hyundaiDeliveryYMSet.has(shiftMonths(c.year_month, -1))

    if (isRelevant) {
      totals.commissionTotal += c.commission_amount
      totals.totalMargin     += c.commission_amount
      totals.a1 += sp.korea_a1; totals.gm += sp.geumhwa; totals.rs += sp.raseong

      const ma = monthlyMap.get(c.year_month) ?? zeroTotals()
      ma.totalMargin     += c.commission_amount
      ma.a1 += sp.korea_a1; ma.gm += sp.geumhwa; ma.rs += sp.raseong
      ma.commissionTotal += c.commission_amount
      monthlyMap.set(c.year_month, ma)

      cp[key].total  += c.commission_amount
      cp[key].qtyTon += c.quantity_kg / 1000
      cp[key].a1     += sp.korea_a1; cp[key].gm += sp.geumhwa; cp[key].rs += sp.raseong
      cp.all.total   += c.commission_amount
      cp.all.a1      += sp.korea_a1; cp.all.gm  += sp.geumhwa; cp.all.rs  += sp.raseong

      if (cp[key].yearMonth === null) {
        cp[key].yearMonth = c.year_month
      } else if (cp[key].yearMonth !== c.year_month) {
        cp[key].yearMonth = 'mixed'
      }

      const cur = commPriceSample[key]
      if (cur === -1) {
        commPriceSample[key] = c.price_per_ton
      } else if (cur !== c.price_per_ton) {
        commPriceSample[key] = -2
      }
    }

    if (!cp.byMonth[c.year_month]) {
      cp.byMonth[c.year_month] = { dongkuk: null, hyundai: null }
    }
    const bm = cp.byMonth[c.year_month]
    if (!bm[key]) {
      bm[key] = { total: 0, a1: 0, gm: 0, rs: 0, qtyTon: 0, pricePerTon: c.price_per_ton }
    }
    bm[key]!.total  += c.commission_amount
    bm[key]!.qtyTon += c.quantity_kg / 1000
    bm[key]!.a1     += sp.korea_a1; bm[key]!.gm += sp.geumhwa; bm[key]!.rs += sp.raseong
    const bmPriceKey = `${c.year_month}_${key}`
    if (byMonthPriceSample[bmPriceKey] === undefined) {
      byMonthPriceSample[bmPriceKey] = c.price_per_ton
    } else if (byMonthPriceSample[bmPriceKey] !== c.price_per_ton) {
      bm[key]!.pricePerTon = null
    }
  }

  cp.dongkuk.pricePerTon = commPriceSample.dongkuk > 0 ? commPriceSample.dongkuk : null
  cp.hyundai.pricePerTon = commPriceSample.hyundai > 0 ? commPriceSample.hyundai : null

  // ─── 3) 결과 조립 ────────────────────────────────────────
  const monthlyData = buildMonthRange(fromYM, toYM).map(ym => ({
    ym, ...(monthlyMap.get(ym) ?? zeroTotals()),
  }))

  const productRows = Array.from(productMap.values()).sort((a, b) => {
    const ai = PRODUCT_ORDER.indexOf(a.name), bi = PRODUCT_ORDER.indexOf(b.name)
    const nameOrder = (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    return nameOrder !== 0 ? nameOrder : a.deliveryYearMonth.localeCompare(b.deliveryYearMonth)
  })

  const availableProducts = Array.from(productsSeen.entries()).sort(
    (a, b) => (PRODUCT_ORDER.indexOf(a[0]) < 0 ? 99 : PRODUCT_ORDER.indexOf(a[0])) -
              (PRODUCT_ORDER.indexOf(b[0]) < 0 ? 99 : PRODUCT_ORDER.indexOf(b[0]))
  )

  return { totals, productRows, monthlyData, commissionsInPeriod: cp, availableProducts }
}

