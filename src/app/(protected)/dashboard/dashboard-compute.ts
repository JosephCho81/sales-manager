/**
 * Dashboard 집계 순수 함수
 * JSX 없음 — 이번달 매출/마진 집계 및 거래처별 breakdown
 */
import { calcMarginFromContract, calcAddlMargin } from '@/lib/margin'

export type DeliveryForDashboard = {
  quantity_kg: number
  addl_quantity_kg: number | null
  addl_margin_per_ton: number | null
  depreciation_amount: number | null
  product: { buyer: string; price_unit: string } | null
  contract: {
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
  } | null
}

export type DashboardTotals = {
  totalSell: number
  totalMargin: number
  totalGm: number
  totalRs: number
  byBuyer: Map<string, { sell: number; margin: number }>
}

export function computeDashboardTotals(deliveries: DeliveryForDashboard[]): DashboardTotals {
  let totalSell = 0, totalMargin = 0, totalGm = 0, totalRs = 0
  const byBuyer = new Map<string, { sell: number; margin: number }>()

  for (const d of deliveries) {
    if (!d.contract) continue

    const isFesi = d.product?.price_unit === 'USD_TON'
    const sellRate = isFesi && d.contract.reference_exchange_rate
      ? d.contract.reference_exchange_rate : 1

    // 감가는 금액 차감(원) — 소괴탄/분탄 전용, FeSi는 null
    const sellKrw = d.contract.sell_price * sellRate * d.quantity_kg / 1000
      - (d.depreciation_amount ?? 0)

    totalSell += sellKrw

    // 마진: 감가가 sell/cost 양쪽 동일 차감되므로 quantity_kg 기준으로 계산
    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    totalMargin += m.total_margin
    totalGm += m.geumhwa
    totalRs += m.raseong

    if (d.addl_quantity_kg && d.addl_margin_per_ton) {
      const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
      totalMargin += am.total_margin
      totalGm += am.geumhwa
      totalRs += am.raseong
    }

    const buyer = d.product?.buyer ?? '기타'
    const prev = byBuyer.get(buyer) ?? { sell: 0, margin: 0 }
    byBuyer.set(buyer, { sell: prev.sell + sellKrw, margin: prev.margin + m.total_margin })
  }

  return { totalSell, totalMargin, totalGm, totalRs, byBuyer }
}
