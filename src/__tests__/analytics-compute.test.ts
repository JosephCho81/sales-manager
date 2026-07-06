import { describe, it, expect } from 'vitest'
import { buildAllAnalytics } from '@/app/(protected)/analytics/analytics-compute'
import { computeMargins } from '@/app/(protected)/analytics/analytics-client'
import type { DeliveryForAnalytics, CommissionEntry } from '@/app/(protected)/analytics/analytics-types'

// ── 헬퍼 ─────────────────────────────────────────────────

function makeDelivery(overrides: Partial<DeliveryForAnalytics> = {}): DeliveryForAnalytics {
  return {
    id: 'd1',
    year_month: '2024-01',
    invoice_month: '2024-01',
    delivery_date: null,
    product_id: 'prod-1',
    quantity_kg: 10_000, // 10톤
    depreciation_amount: null,
    product: { id: 'prod-1', name: 'AL35B', display_name: 'AL35B', buyer: '동국제강' },
    contract: {
      sell_price: 1_900_000,
      cost_price: 1_800_000,
      currency: 'KRW',
      reference_exchange_rate: null,
    },
    ...overrides,
  }
}

function makeCommission(overrides: Partial<CommissionEntry> = {}): CommissionEntry {
  return {
    year_month: '2024-01',
    commission_amount: 300_000,
    company: '동국제강',
    quantity_kg: 10_000,
    price_per_ton: 30_000,
    ...overrides,
  }
}

// ── computeMargins ────────────────────────────────────────
describe('computeMargins', () => {
  it('KRW 계약 — 마진 금액·물량 정확, 3사 배분 항등성', () => {
    // 10톤, 판매 1,900,000 / 원가 1,800,000 → 마진 100,000원/톤 × 10 = 1,000,000
    const result = computeMargins([makeDelivery()], [])
    expect(result.totalMargin).toBe(1_000_000)
    expect(result.qtyTon).toBe(10)
    expect(result.a1 + result.gm + result.rs).toBe(result.totalMargin)
  })

  it('USD 계약 — 참고환율 적용하여 원화 마진 계산', () => {
    // (1500 - 1200) USD/톤 × 1400원/USD × 10톤 = 4,200,000원
    const d = makeDelivery({
      product: { id: 'prod-2', name: 'FESI75', display_name: 'FeSi 75%', buyer: '동국제강' },
      contract: {
        sell_price: 1500,
        cost_price: 1200,
        currency: 'USD',
        reference_exchange_rate: 1400,
      },
    })
    const result = computeMargins([d], [])
    expect(result.totalMargin).toBe(4_200_000)
    expect(result.sellKrw).toBe(1500 * 1400 * 10)
    expect(result.costKrw).toBe(1200 * 1400 * 10)
    expect(result.a1 + result.gm + result.rs).toBe(result.totalMargin)
  })

  it('판매·원가 0원 — throw 없이 마진 0 반환', () => {
    const d = makeDelivery({
      contract: { sell_price: 0, cost_price: 0, currency: 'KRW', reference_exchange_rate: null },
    })
    expect(() => computeMargins([d], [])).not.toThrow()
    const result = computeMargins([d], [])
    expect(result.totalMargin).toBe(0)
    expect(result.qtyTon).toBe(10)
  })

  it('빈 입력 — 모든 필드 0', () => {
    const result = computeMargins([], [])
    expect(result.totalMargin).toBe(0)
    expect(result.qtyTon).toBe(0)
    expect(result.sellKrw).toBe(0)
    expect(result.costKrw).toBe(0)
    expect(result.commissionTotal).toBe(0)
    expect(result.a1).toBe(0)
    expect(result.gm).toBe(0)
    expect(result.rs).toBe(0)
  })

  it('커미션 포함 — totalMargin과 commissionTotal에 반영', () => {
    // 납품 마진 1,000,000 + 커미션 300,000 = 1,300,000
    const result = computeMargins([makeDelivery()], [makeCommission()])
    expect(result.totalMargin).toBe(1_300_000)
    expect(result.commissionTotal).toBe(300_000)
    expect(result.a1 + result.gm + result.rs).toBe(result.totalMargin)
  })

  it('날짜 범위 필터 — 범위 밖 invoice_month 납품 제외', () => {
    const d1 = makeDelivery({ id: 'd1', invoice_month: '2024-01' })
    const d2 = makeDelivery({ id: 'd2', invoice_month: '2024-03' })
    const result = computeMargins([d1, d2], [], '2024-01', '2024-01')
    expect(result.qtyTon).toBe(10)          // d2(2024-03) 제외
    expect(result.totalMargin).toBe(1_000_000)
  })
})

// ── buildAllAnalytics ──────────────────────────────────────
describe('buildAllAnalytics', () => {
  it('빈 입력 — totals 전부 0, monthlyData 슬롯은 범위대로 생성', () => {
    const result = buildAllAnalytics([], [], '2024-01', '2024-03')
    expect(result.totals.totalMargin).toBe(0)
    expect(result.totals.qtyTon).toBe(0)
    expect(result.productRows).toHaveLength(0)
    // 2024-01 ~ 2024-03 → 3개 슬롯
    expect(result.monthlyData).toHaveLength(3)
    expect(result.monthlyData[0].ym).toBe('2024-01')
    expect(result.monthlyData[2].ym).toBe('2024-03')
    expect(result.monthlyData.every(m => m.totalMargin === 0)).toBe(true)
  })

  it('단일 납품 — totals·productRows·monthlyData 모두 집계', () => {
    // 10톤, 마진 100,000원/톤 → 1,000,000원
    const result = buildAllAnalytics([makeDelivery()], [], '2024-01', '2024-01')
    expect(result.totals.totalMargin).toBe(1_000_000)
    expect(result.totals.qtyTon).toBe(10)
    expect(result.productRows).toHaveLength(1)
    expect(result.productRows[0].totalMargin).toBe(1_000_000)
    expect(result.monthlyData[0].totalMargin).toBe(1_000_000)
  })

  it('다른 품목 두 납품 — productRows 2개, 교차 오염 없음', () => {
    const d1 = makeDelivery({
      id: 'd1', product_id: 'prod-1',
      product: { id: 'prod-1', name: 'AL35B', display_name: 'AL35B', buyer: '동국제강' },
      contract: { sell_price: 1_900_000, cost_price: 1_800_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const d2 = makeDelivery({
      id: 'd2', product_id: 'prod-2',
      product: { id: 'prod-2', name: 'AL65B', display_name: 'AL65B', buyer: '동국제강' },
      contract: { sell_price: 2_100_000, cost_price: 2_000_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const result = buildAllAnalytics([d1, d2], [], '2024-01', '2024-01')

    expect(result.productRows).toHaveLength(2)
    const al35 = result.productRows.find(r => r.name === 'AL35B')!
    const al65 = result.productRows.find(r => r.name === 'AL65B')!
    expect(al35.totalMargin).toBe(1_000_000)   // AL65B 오염 없음
    expect(al65.totalMargin).toBe(1_000_000)   // AL35B 오염 없음
    expect(result.totals.totalMargin).toBe(2_000_000)
  })

  it('같은 품목 다른 월 — productRows에 월별 분리, monthlyData도 독립', () => {
    const d1 = makeDelivery({ id: 'd1', year_month: '2024-01', invoice_month: '2024-01' })
    const d2 = makeDelivery({ id: 'd2', year_month: '2024-02', invoice_month: '2024-02' })
    const result = buildAllAnalytics([d1, d2], [], '2024-01', '2024-02')

    // 같은 product_id이지만 year_month가 다르므로 별도 row
    expect(result.productRows).toHaveLength(2)
    expect(result.productRows[0].deliveryYearMonth).toBe('2024-01')
    expect(result.productRows[1].deliveryYearMonth).toBe('2024-02')
    expect(result.productRows[0].totalMargin).toBe(1_000_000)
    expect(result.productRows[1].totalMargin).toBe(1_000_000)

    const jan = result.monthlyData.find(m => m.ym === '2024-01')!
    const feb = result.monthlyData.find(m => m.ym === '2024-02')!
    expect(jan.totalMargin).toBe(1_000_000)
    expect(feb.totalMargin).toBe(1_000_000)
  })

  it('3사 배분 항등성 — a1 + gm + rs = totalMargin', () => {
    const d = makeDelivery({ quantity_kg: 30_000 }) // 30톤
    const result = buildAllAnalytics([d], [], '2024-01', '2024-01')
    expect(result.totals.a1 + result.totals.gm + result.totals.rs).toBe(result.totals.totalMargin)
  })

  it('동국제강 커미션 — AL35B 납품 월과 일치 시 totals에 반영', () => {
    // AL35B delivery in 2024-01 → dongkukDeliveryYMSet has '2024-01'
    // commission year_month '2024-01' → isRelevant = true
    const result = buildAllAnalytics(
      [makeDelivery()],
      [makeCommission()],
      '2024-01', '2024-01',
    )
    expect(result.totals.commissionTotal).toBe(300_000)
    expect(result.totals.totalMargin).toBe(1_300_000)
  })

  it('동국제강 커미션 — 납품 없는 월이면 totals에 미반영', () => {
    // delivery in 2024-01, commission in 2024-02 → no AL35B delivery in 2024-02
    const c = makeCommission({ year_month: '2024-02', commission_amount: 300_000 })
    const result = buildAllAnalytics(
      [makeDelivery()],
      [c],
      '2024-01', '2024-02',
    )
    expect(result.totals.commissionTotal).toBe(0)
  })
})

// ── buildAllAnalytics 월별 감가 (분탄 렘코 미수) ──────────
describe('buildAllAnalytics 월별 감가 (분탄 렘코 미수)', () => {
  const buntanDelivery = makeDelivery({
    id: 'b1', year_month: '2026-07', invoice_month: '2026-08', delivery_date: '2026-07-15',
    product_id: 'prod-b',
    product: { id: 'prod-b', name: 'BUNTAN', display_name: '분탄', buyer: '렘코' },
    contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
  })

  it('매출만 차감, 매입·마진 불변, depreciationKrw 기록', () => {
    const out = buildAllAnalytics([buntanDelivery], [], '2026-08', '2026-08',
      [{ product_id: 'prod-b', year_month: '2026-07', amount: 100_000 }])
    expect(out.totals.sellKrw).toBe(1_900_000)     // 2_000_000 − 100_000
    expect(out.totals.costKrw).toBe(1_800_000)     // 총액
    expect(out.totals.totalMargin).toBe(200_000)   // 불변
    expect(out.productRows[0].depreciationKrw).toBe(100_000)
    const aug = out.monthlyData.find(m => m.ym === '2026-08')!
    expect(aug.sellKrw).toBe(1_900_000)
  })

  it('매칭되지 않는 감가(다른 품목/월)는 미적용', () => {
    const out = buildAllAnalytics([buntanDelivery], [], '2026-08', '2026-08', [
      { product_id: 'other',  year_month: '2026-07', amount: 999_999 },
      { product_id: 'prod-b', year_month: '2026-06', amount: 999_999 },
    ])
    expect(out.totals.sellKrw).toBe(2_000_000)
    expect(out.productRows[0].depreciationKrw).toBe(0)
  })

  it('monthlyDeps 미전달 — 기존 동작 불변', () => {
    const out = buildAllAnalytics([buntanDelivery], [], '2026-08', '2026-08')
    expect(out.totals.sellKrw).toBe(2_000_000)
  })
})
