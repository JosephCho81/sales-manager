/**
 * Analytics 공유 타입 및 상수
 * (analytics-compute.ts / analytics-change.ts 양쪽에서 사용)
 */

export type DeliveryForAnalytics = {
  id: string
  year_month: string
  invoice_month: string
  product_id: string
  quantity_kg: number
  depreciation_amount: number | null
  product: { id: string; name: string; display_name: string; buyer: string } | null
  contract: {
    sell_price: number; cost_price: number
    currency: string; reference_exchange_rate: number | null
  } | null
}

export type CommissionEntry = {
  year_month: string
  commission_amount: number
  company: string
  quantity_kg: number
  price_per_ton: number
}

export type MarginTotals = {
  qtyTon: number; sellKrw: number; costKrw: number
  totalMargin: number; a1: number; gm: number; rs: number
  geumhwaSellKrw: number
  commissionTotal: number
}

export type ProductRow = MarginTotals & {
  productId: string; name: string; displayName: string; buyer: string
  deliveryYearMonth: string
  sellPricePerTon: number | null
  costPricePerTon: number | null
}

export type MonthlyData = { ym: string } & MarginTotals

export type CommissionMonthSlice = {
  total: number; a1: number; gm: number; rs: number
  qtyTon: number; pricePerTon: number | null
}

export type CommissionsInPeriod = {
  dongkuk: CommissionMonthSlice & { yearMonth: string | null }
  hyundai: CommissionMonthSlice & { yearMonth: string | null }
  all:     { total: number; a1: number; gm: number; rs: number }
  byMonth: Record<string, { dongkuk: CommissionMonthSlice | null; hyundai: CommissionMonthSlice | null }>
}

export type AllAnalytics = {
  totals: MarginTotals
  productRows: ProductRow[]
  monthlyData: MonthlyData[]
  commissionsInPeriod: CommissionsInPeriod
  availableProducts: [string, string][]
}

export type ProductChange = {
  productId: string
  name: string
  displayName: string
  buyer: string
  curQtyTon: number
  curMargin: number
  curSellPrice: number | null
  prevQtyTon: number
  prevMargin: number
  prevSellPrice: number | null
  qtyDelta: number
  qtyPct: number | null
  marginDelta: number
  marginPct: number | null
  priceChanged: boolean
  distributionChanged: boolean
  causeText: string
  isNew: boolean
}

export type ChangeAnalysisResult = {
  changes: ProductChange[]
  hasPrevData: boolean
  prevFromYM: string
  prevToYM: string
}

export const PRODUCT_ORDER = ['AL35B', 'AL65B', 'SOGGAE', 'BUNTAN', 'FESI75', 'FESI60', 'AL30']
