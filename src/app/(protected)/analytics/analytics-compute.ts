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

export type CommissionsInPeriod = {
  dongkuk: { total: number; a1: number; gm: number; rs: number }
  hyundai: { total: number; a1: number; gm: number; rs: number }
  all:     { total: number; a1: number; gm: number; rs: number }
}

export type AllAnalytics = {
  totals: MarginTotals
  productRows: ProductRow[]
  monthlyData: MonthlyData[]
  commissionsInPeriod: CommissionsInPeriod
  availableProducts: [string, string][]   // [name, display_name][]
}

// ── 상수 ──
export const PRODUCT_ORDER = ['AL35B', 'AL65B', 'SOGGAE', 'BUNTAN', 'FESI75', 'FESI60', 'AL30']

// ── 내부 헬퍼 ──
/** 커미션 지급월 = 발생 기준월 + 1 */
function commissionPaymentMonth(ym: string): string {
  return shiftMonths(ym, 1)
}

function zeroTotals(): MarginTotals {
  return { qtyTon: 0, sellKrw: 0, costKrw: 0, totalMargin: 0, a1: 0, gm: 0, rs: 0, geumhwaSellKrw: 0, commissionTotal: 0 }
}

function zeroSplit() {
  return { total: 0, a1: 0, gm: 0, rs: 0 }
}

/**
 * 납품 건 1개를 MarginTotals 누산기에 반영 (mutates acc)
 * buildAllAnalytics / computeMargins / buildProductRows / buildMonthlyData
 * 4개 함수의 동일 누산 패턴을 한 곳으로 통합
 */
function accDelivery(
  acc: MarginTotals,
  m: { quantity_ton: number; sell_price_krw: number; cost_price_krw: number; total_margin: number; korea_a1: number; geumhwa: number; raseong: number },
  gmSell: number,
): void {
  acc.qtyTon         += m.quantity_ton
  acc.sellKrw        += m.sell_price_krw * m.quantity_ton
  acc.costKrw        += m.cost_price_krw * m.quantity_ton
  acc.totalMargin    += m.total_margin
  acc.a1             += m.korea_a1
  acc.gm             += m.geumhwa
  acc.rs             += m.raseong
  acc.geumhwaSellKrw += gmSell
}

/** fromYM~toYM 사이의 YYYY-MM 배열 생성 */
function buildMonthRange(fromYM: string, toYM: string): string[] {
  const months: string[] = []
  const cur = new Date(fromYM + '-02')
  const end = new Date(toYM   + '-02')
  while (cur <= end) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

// ────────────────────────────────────────────────────────────────────────────
// 서버 사이드 — 단일 패스 전체 집계
// ────────────────────────────────────────────────────────────────────────────
/**
 * deliveries + commissions를 각각 한 번씩만 순회하여
 * totals / productRows / monthlyData / commissionsInPeriod / availableProducts를
 * 한꺼번에 반환한다.
 *
 * page.tsx(서버 컴포넌트)에서 호출 → 클라이언트에 raw 계산 비용을 넘기지 않는다.
 * 초기 렌더(필터 없음) 시 클라이언트는 이 결과를 그대로 사용한다.
 */
export function buildAllAnalytics(
  deliveries: DeliveryForAnalytics[],
  commissions: CommissionEntry[],
  fromYM: string,
  toYM: string,
): AllAnalytics {
  const totals       = zeroTotals()
  const productMap   = new Map<string, ProductRow>()
  const monthlyMap   = new Map<string, MarginTotals>()
  const productsSeen = new Map<string, string>()   // name → display_name

  // ─── 1) deliveries 단일 패스 ───────────────────────────
  for (const d of deliveries) {
    if (!d.contract) continue

    const m      = calcMarginFromContract(d.contract, d.quantity_kg)
    const isAL35 = d.product?.name.toUpperCase() === 'AL35B'
    const gmSell = isAL35 ? m.cost_price_krw * m.quantity_ton + m.geumhwa : 0

    // totals
    accDelivery(totals, m, gmSell)

    // productRows
    if (d.product) {
      if (!productsSeen.has(d.product.name)) {
        productsSeen.set(d.product.name, d.product.display_name)
      }
      const key = `${d.product_id}_${d.year_month}`
      const ex  = productMap.get(key)
      if (ex) {
        accDelivery(ex, m, gmSell)
      } else {
        const row: ProductRow = {
          ...zeroTotals(),
          productId: d.product_id, name: d.product.name,
          displayName: d.product.display_name, buyer: d.product.buyer,
          deliveryYearMonth: d.year_month,
        }
        accDelivery(row, m, gmSell)
        productMap.set(key, row)
      }
    }

    // monthlyMap (invoice_month 기준 버킷)
    const ma = monthlyMap.get(d.invoice_month) ?? zeroTotals()
    accDelivery(ma, m, gmSell)
    monthlyMap.set(d.invoice_month, ma)
  }

  // ─── 2) commissions 단일 패스 ──────────────────────────
  const cp: CommissionsInPeriod = {
    dongkuk: zeroSplit(),
    hyundai: zeroSplit(),
    all:     zeroSplit(),
  }

  for (const c of commissions) {
    const payMonth = commissionPaymentMonth(c.year_month)
    if (payMonth < fromYM || payMonth > toYM) continue

    const sp = splitMargin(c.commission_amount)
    totals.commissionTotal += c.commission_amount
    totals.totalMargin     += c.commission_amount
    totals.a1 += sp.korea_a1; totals.gm += sp.geumhwa; totals.rs += sp.raseong

    const ma = monthlyMap.get(payMonth) ?? zeroTotals()
    ma.totalMargin     += c.commission_amount
    ma.a1 += sp.korea_a1; ma.gm += sp.geumhwa; ma.rs += sp.raseong
    ma.commissionTotal += c.commission_amount
    monthlyMap.set(payMonth, ma)

    const key = c.company === '동국제강' ? 'dongkuk' : 'hyundai'
    cp[key].total += c.commission_amount
    cp[key].a1    += sp.korea_a1; cp[key].gm += sp.geumhwa; cp[key].rs += sp.raseong
    cp.all.total  += c.commission_amount
    cp.all.a1     += sp.korea_a1; cp.all.gm  += sp.geumhwa; cp.all.rs  += sp.raseong
  }

  // ─── 3) 결과 조립 ─────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────────
// 클라이언트 사이드 — 필터 적용 후 재집계
// (product/buyer 필터가 활성화된 경우에만 호출됨)
// ────────────────────────────────────────────────────────────────────────────
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
    const gmSell = isAL35 ? m.cost_price_krw * m.quantity_ton + m.geumhwa : 0
    accDelivery(acc, m, gmSell)
  }
  for (const c of commissions) {
    const payMonth = commissionPaymentMonth(c.year_month)
    if (fromYM && (payMonth < fromYM || payMonth > toYM!)) continue
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
    const gmSell = isAL35 ? m.cost_price_krw * m.quantity_ton + m.geumhwa : 0

    const key = `${d.product_id}_${d.year_month}`
    const ex  = map.get(key)
    if (ex) {
      accDelivery(ex, m, gmSell)
    } else {
      const row: ProductRow = {
        ...zeroTotals(),
        productId: d.product_id, name: d.product.name,
        displayName: d.product.display_name, buyer: d.product.buyer,
        deliveryYearMonth: d.year_month,
      }
      accDelivery(row, m, gmSell)
      map.set(key, row)
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const ai = PRODUCT_ORDER.indexOf(a.name), bi = PRODUCT_ORDER.indexOf(b.name)
    const nameOrder = (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    return nameOrder !== 0 ? nameOrder : a.deliveryYearMonth.localeCompare(b.deliveryYearMonth)
  })
}

/**
 * buildMonthlyData — O(n) 구현
 * 이전: 월별로 deliveries 전체를 재스캔 → O(months × n)
 * 현재: deliveries + commissions를 각 한 번씩 순회하여 Map에 버킷 → O(n)
 */
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
    const gmSell = isAL35 ? m.cost_price_krw * m.quantity_ton + m.geumhwa : 0
    const ma     = monthlyMap.get(d.invoice_month) ?? zeroTotals()
    accDelivery(ma, m, gmSell)
    monthlyMap.set(d.invoice_month, ma)
  }

  for (const c of commissions) {
    const payMonth = commissionPaymentMonth(c.year_month)
    if (payMonth < fromYM || payMonth > toYM) continue
    const sp = splitMargin(c.commission_amount)
    const ma = monthlyMap.get(payMonth) ?? zeroTotals()
    ma.totalMargin     += c.commission_amount
    ma.a1 += sp.korea_a1; ma.gm += sp.geumhwa; ma.rs += sp.raseong
    ma.commissionTotal += c.commission_amount
    monthlyMap.set(payMonth, ma)
  }

  return buildMonthRange(fromYM, toYM).map(ym => ({ ym, ...(monthlyMap.get(ym) ?? zeroTotals()) }))
}
