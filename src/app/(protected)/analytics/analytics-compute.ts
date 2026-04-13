/**
 * Analytics 계산 순수 함수 (JSX 없음)
 *
 * ┌─────────────────────────────────────────────────────┐
 * │  서버 전용 (page.tsx에서만 호출)                      │
 * │    buildAllAnalytics  — 단일 패스 전체 집계           │
 * │    extractAvailableProducts — 필터 드롭다운용 품목 목록 │
 * ├─────────────────────────────────────────────────────┤
 * │  클라이언트 호환 (필터 활성 시 AnalyticsClient에서 호출) │
 * │    computeMargins   — totals 재계산                  │
 * │    buildProductRows — 품목별 행 재계산                │
 * │    buildMonthlyData — 월별 데이터 재계산              │
 * └─────────────────────────────────────────────────────┘
 *
 * 집계 기준: invoice_month (지급 스케줄 월) — year_month(납품월)가 아님
 * invoice_month = delivery_date + contract.invoice_month_offset
 */
import { calcMarginFromContract, splitMargin } from '@/lib/margin'

// ── 타입 ──
export type DeliveryForAnalytics = {
  id: string
  year_month: string        // 납품월 (배송월) — "N월분" 라벨용
  invoice_month: string     // 지급 스케줄 월 — 집계 기준
  product_id: string
  quantity_kg: number
  depreciation_amount: number | null  // 소괴탄/분탄 감가 금액
  product: { id: string; name: string; display_name: string; buyer: string } | null
  contract: {
    sell_price: number; cost_price: number
    currency: string; reference_exchange_rate: number | null
  } | null
}

/** commissions 테이블에서 가져오는 커미션 데이터 */
export type CommissionEntry = {
  year_month: string        // 발생 기준월 = 납품월 기준으로 커미션 매칭
  commission_amount: number
  company: string           // '동국제강' | '현대제철'
  quantity_kg: number       // 저장된 물량(kg) — 표시 시 /1000 하여 톤 변환
  price_per_ton: number     // 저장된 단가(원/톤)
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
  sellPricePerTon: number | null  // 계약 매출단가(원/톤). 동일 버킷 내 단가 불일치 시 null
  costPricePerTon: number | null  // 계약 매입단가(원/톤). 동일 버킷 내 단가 불일치 시 null
}

export type MonthlyData = { ym: string } & MarginTotals

export type CommissionsInPeriod = {
  dongkuk: { total: number; a1: number; gm: number; rs: number; qtyTon: number; pricePerTon: number | null; yearMonth: string | null }
  hyundai: { total: number; a1: number; gm: number; rs: number; qtyTon: number; pricePerTon: number | null; yearMonth: string | null }
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
function zeroTotals(): MarginTotals {
  return { qtyTon: 0, sellKrw: 0, costKrw: 0, totalMargin: 0, a1: 0, gm: 0, rs: 0, geumhwaSellKrw: 0, commissionTotal: 0 }
}

function zeroSplit() {
  return { total: 0, a1: 0, gm: 0, rs: 0, qtyTon: 0, pricePerTon: null as number | null, yearMonth: null as string | null }
}

/**
 * 납품 건 1개를 MarginTotals 누산기에 반영 (mutates acc)
 * buildAllAnalytics / computeMargins / buildProductRows / buildMonthlyData
 * 4개 함수의 동일 누산 패턴을 한 곳으로 통합.
 *
 * depAmount: 소괴탄/분탄 감가 금액(원). 매출·매입 합계에서 동일하게 차감.
 * 마진(total_margin)은 불변 — 감가가 매출·매입 양쪽에서 상쇄되기 때문.
 */
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
 * 필터 드롭다운에 표시할 품목 목록 추출.
 * 반드시 필터 적용 전(전체) deliveries에서 호출해야 모든 품목이 보인다.
 */
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
    const dep    = d.depreciation_amount ?? 0

    // totals
    accDelivery(totals, m, gmSell, dep)

    // productRows
    if (d.product) {
      if (!productsSeen.has(d.product.name)) {
        productsSeen.set(d.product.name, d.product.display_name)
      }
      const key = `${d.product_id}_${d.year_month}`
      const ex  = productMap.get(key)
      if (ex) {
        // 단가 일관성 체크 — 동일 버킷 내 단가 불일치 시 null
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
        productMap.set(key, row)
      }
    }

    // monthlyMap (invoice_month 기준 버킷)
    const ma = monthlyMap.get(d.invoice_month) ?? zeroTotals()
    accDelivery(ma, m, gmSell, dep)
    monthlyMap.set(d.invoice_month, ma)
  }

  // ─── 2) commissions 단일 패스 ──────────────────────────
  const cp: CommissionsInPeriod = {
    dongkuk: zeroSplit(),
    hyundai: zeroSplit(),
    all:     zeroSplit(),
  }
  // 커미션 단가 일관성 추적 (-1 = 아직 항목 없음)
  const commPriceSample: { dongkuk: number; hyundai: number } = { dongkuk: -1, hyundai: -1 }

  for (const c of commissions) {
    if (c.year_month < fromYM || c.year_month > toYM) continue

    const sp = splitMargin(c.commission_amount)
    totals.commissionTotal += c.commission_amount
    totals.totalMargin     += c.commission_amount
    totals.a1 += sp.korea_a1; totals.gm += sp.geumhwa; totals.rs += sp.raseong

    const ma = monthlyMap.get(c.year_month) ?? zeroTotals()
    ma.totalMargin     += c.commission_amount
    ma.a1 += sp.korea_a1; ma.gm += sp.geumhwa; ma.rs += sp.raseong
    ma.commissionTotal += c.commission_amount
    monthlyMap.set(c.year_month, ma)

    const key = c.company === '동국제강' ? 'dongkuk' : 'hyundai'
    cp[key].total  += c.commission_amount
    cp[key].qtyTon += c.quantity_kg / 1000
    cp[key].a1     += sp.korea_a1; cp[key].gm += sp.geumhwa; cp[key].rs += sp.raseong
    cp.all.total   += c.commission_amount
    cp.all.a1      += sp.korea_a1; cp.all.gm  += sp.geumhwa; cp.all.rs  += sp.raseong

    // year_month(발생 기준월) 추적 — 복수 월이면 'mixed'로 마킹
    if (cp[key].yearMonth === null) {
      cp[key].yearMonth = c.year_month
    } else if (cp[key].yearMonth !== c.year_month) {
      cp[key].yearMonth = 'mixed'
    }

    // 단가 일관성 체크
    const cur = commPriceSample[key]
    if (cur === -1) {
      commPriceSample[key] = c.price_per_ton
    } else if (cur !== c.price_per_ton) {
      commPriceSample[key] = -2  // 불일치 마킹
    }
  }

  // pricePerTon 확정 (-1: 항목없음→null, -2: 불일치→null, 그 외: 단가 값)
  cp.dongkuk.pricePerTon = commPriceSample.dongkuk > 0 ? commPriceSample.dongkuk : null
  cp.hyundai.pricePerTon = commPriceSample.hyundai > 0 ? commPriceSample.hyundai : null

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
    const gmSell = isAL35 ? m.cost_price_krw * m.quantity_ton + m.geumhwa : 0
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
