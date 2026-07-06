import { describe, it, expect } from 'vitest'
import { makeInvoice, calcCombinedMargin, separateALMargins } from '@/lib/invoice-generator/utils'
import { genSoggae, genBuntan } from '@/lib/invoice-generator/coal'
import { genFeSi } from '@/lib/invoice-generator/fesi'
import { genALSeries } from '@/lib/invoice-generator/al-series'
import { genAL30 } from '@/lib/invoice-generator/al30'
import { generateCommissionInvoices } from '@/lib/invoice-generator/commission'
import { generateInvoices } from '@/lib/invoice-generator'
import type { DeliveryForInvoice } from '@/lib/invoice-generator/types'
import type { CommissionForInvoice } from '@/lib/invoice-generator/commission'

// ── 헬퍼 ─────────────────────────────────────────────────

function makeDelivery(overrides: Partial<DeliveryForInvoice> = {}): DeliveryForInvoice {
  return {
    id: 'd1',
    year_month: '2024-01',
    delivery_date: '2024-01-15',
    product_id: 'prod-1',
    product_name: 'AL35B',
    product_vat: 'TEN_PERCENT',
    quantity_kg: 10_000,
    depreciation_amount: null,
    fx_rate: null,
    contract: {
      sell_price: 1_900_000,
      cost_price: 1_800_000,
      currency: 'KRW',
      reference_exchange_rate: null,
    },
    ...overrides,
  }
}

function makeCommission(overrides: Partial<CommissionForInvoice> = {}): CommissionForInvoice {
  return {
    id: 'c1',
    year_month: '2024-01',
    company: '동국제강',
    commission_amount: 300_000,
    memo: null,
    ...overrides,
  }
}

const INVOICE_BASE = {
  yearMonth: '2024-02', deliveryYearMonth: '2024-01', productId: 'prod-1',
  deliveryIds: ['d1'], from: 'A', to: 'B',
  basisDate: '2024-01-31', deadline: '2024-02-01', paymentDue: '2024-02-28',
  type: 'sales' as const, memo: 'test',
}

// ── makeInvoice ───────────────────────────────────────────
describe('makeInvoice', () => {
  it('supply 소수점 반올림', () => {
    const inv = makeInvoice({ ...INVOICE_BASE, supply: 1000.6, vat: false })
    expect(inv.supply_amount).toBe(1001)
    expect(inv.total_amount).toBe(1001)
  })

  it('VAT 10% — round(supply × 0.1), total = supply + vat', () => {
    const inv = makeInvoice({ ...INVOICE_BASE, supply: 1_000_000, vat: true })
    expect(inv.vat_amount).toBe(100_000)
    expect(inv.total_amount).toBe(1_100_000)
  })

  it('VAT 10% — 원 단위 미만 반올림 (동국 입금액과 일치)', () => {
    // 39,729,716 × 0.1 = 3,972,971.6 → 반올림 3,972,972 → 총액 43,702,688
    const inv = makeInvoice({ ...INVOICE_BASE, supply: 39_729_716, vat: true })
    expect(inv.vat_amount).toBe(3_972_972)
    expect(inv.total_amount).toBe(43_702_688)
  })

  it('VAT 10% — 동창은 절사(버림) (동창 세금계산서와 일치)', () => {
    // 441,049,237 × 0.1 = 44,104,923.7 → 동창 절사 44,104,923 (반올림이면 ...924)
    const inv = makeInvoice({ ...INVOICE_BASE, from: '(주)한국에이원', to: '동창', supply: 441_049_237, vat: true })
    expect(inv.vat_amount).toBe(44_104_923)
    expect(inv.total_amount).toBe(485_154_160)
  })

  it('VAT 없음 — vat_amount: 0, total = supply', () => {
    const inv = makeInvoice({ ...INVOICE_BASE, supply: 1_000_000, vat: false })
    expect(inv.vat_amount).toBe(0)
    expect(inv.total_amount).toBe(1_000_000)
  })

  it('is_paid 항상 false', () => {
    expect(makeInvoice({ ...INVOICE_BASE, supply: 1000, vat: false }).is_paid).toBe(false)
  })
})

// ── calcCombinedMargin ────────────────────────────────────
describe('calcCombinedMargin', () => {
  it('KRW 단일 납품 — 마진 정확, 3사 항등성', () => {
    // sell 1_900_000, cost 1_800_000, 10톤 → 1_000_000
    const { totalMargin, korea_a1, geumhwa, raseong } = calcCombinedMargin([makeDelivery()])
    expect(totalMargin).toBe(1_000_000)
    expect(korea_a1 + geumhwa + raseong).toBe(totalMargin)
  })

  it('복수 납품 — 마진 누적 합산', () => {
    const d1 = makeDelivery({ id: 'd1' })
    const d2 = makeDelivery({ id: 'd2' })
    expect(calcCombinedMargin([d1, d2]).totalMargin).toBe(2_000_000)
  })
})

// ── separateALMargins ─────────────────────────────────────
describe('separateALMargins', () => {
  it('main.total = totalMargin, 3사 항등성', () => {
    const { main } = separateALMargins([makeDelivery()])
    expect(main.total).toBe(1_000_000)
    expect(main.korea_a1 + main.geumhwa + main.raseong).toBe(main.total)
  })
})

// ── genSoggae ─────────────────────────────────────────────
describe('genSoggae', () => {
  const d = makeDelivery({
    product_name: 'SOGGAE',
    contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
  })

  it('항상 4장 반환', () => {
    expect(genSoggae([d], '2024-02')).toHaveLength(4)
  })

  it('VAT — 매출·원가 0, 커미션 2장은 10% (소괴탄 커미션 VAT 적용)', () => {
    const [sales, cost, gm, rs] = genSoggae([d], '2024-02')
    expect(sales.vat_amount).toBe(0)
    expect(cost.vat_amount).toBe(0)
    // 66,666 × 0.1 = 6,666.6 → 반올림 6,667 / 66,668 × 0.1 = 6,666.8 → 6,667
    expect(gm.vat_amount).toBe(6_667)
    expect(rs.vat_amount).toBe(6_667)
  })

  it('from/to 순서 — 동국역발행(매출) / 렘코(원가) / 금화(커미션) / 나성(커미션)', () => {
    const [sales, cost, gm, rs] = genSoggae([d], '2024-02')
    expect(sales.from_company).toBe('동국제강')
    expect(sales.to_company).toBe('(주)한국에이원')
    expect(cost.from_company).toBe('(주)한국에이원')
    expect(cost.to_company).toBe('렘코')
    expect(gm.to_company).toBe('금화')
    expect(rs.to_company).toBe('(주)나성')
  })

  it('매출금액 = sell_price × 10톤', () => {
    // 200_000 × 10_000 / 1000 = 2_000_000
    const [sales] = genSoggae([d], '2024-02')
    expect(sales.supply_amount).toBe(2_000_000)
  })

  it('커미션 금액 = splitMargin(round(sell - cost))', () => {
    // margin = 200_000, splitMargin → geumhwa: 66_666, raseong: 66_668
    const [, , gm, rs] = genSoggae([d], '2024-02')
    expect(gm.supply_amount).toBe(66_666)
    expect(rs.supply_amount).toBe(66_668)
  })

  it('감가(depreciation_amount) — 매출·원가 모두 차감', () => {
    const dDep = makeDelivery({
      product_name: 'SOGGAE',
      depreciation_amount: 50_000,
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
    // sellTotal = 2_000_000 - 50_000 = 1_950_000 / costTotal = 1_800_000 - 50_000 = 1_750_000
    const [sales, cost] = genSoggae([dDep], '2024-02')
    expect(sales.supply_amount).toBe(1_950_000)
    expect(cost.supply_amount).toBe(1_750_000)
  })
})

// ── genBuntan ─────────────────────────────────────────────
describe('genBuntan', () => {
  const d = makeDelivery({
    product_name: 'BUNTAN',
    contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
  })

  it('항상 4장 반환', () => {
    expect(genBuntan([d], '2024-02')).toHaveLength(4)
  })

  it('VAT 10% — 4장 전부', () => {
    expect(genBuntan([d], '2024-02').every(i => i.vat_amount > 0)).toBe(true)
  })

  it('from/to 순서 — 렘코역발행(매출) / 동창(원가)', () => {
    const [sales, cost] = genBuntan([d], '2024-02')
    expect(sales.from_company).toBe('렘코')
    expect(sales.to_company).toBe('(주)한국에이원')
    expect(cost.from_company).toBe('(주)한국에이원')
    expect(cost.to_company).toBe('동창')
  })

  it('감가 반영 — soggae와 동일 로직', () => {
    const dDep = makeDelivery({
      product_name: 'BUNTAN',
      depreciation_amount: 50_000,
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const [sales, cost] = genBuntan([dDep], '2024-02')
    expect(sales.supply_amount).toBe(1_950_000)
    expect(cost.supply_amount).toBe(1_750_000)
  })

  describe('월별 감가 (동창 미지급 — 2026-07 렘코 상장 대응)', () => {
    // sell 200_000 × 10톤 = 2_000_000 / cost 180_000 × 10톤 = 1_800_000
    it('매입(동창) 계산서만 차감, 매출(렘코)은 총액', () => {
      const [sales, cost] = genBuntan([d], '2024-02', 100_000)
      expect(sales.supply_amount).toBe(2_000_000)
      expect(cost.supply_amount).toBe(1_700_000)
    })

    it('커미션은 월별 감가 제외한 총액 기준 (과소지급 방지)', () => {
      const withDep = genBuntan([d], '2024-02', 100_000)
      const noDep   = genBuntan([d], '2024-02')
      expect(withDep[2].supply_amount).toBe(noDep[2].supply_amount)
      expect(withDep[3].supply_amount).toBe(noDep[3].supply_amount)
    })

    it('monthlyDep 미전달 — 기존 금액 불변 (과거 월 회귀)', () => {
      const [sales, cost] = genBuntan([d], '2024-02')
      expect(sales.supply_amount).toBe(2_000_000)
      expect(cost.supply_amount).toBe(1_800_000)
    })

    it('동창 매입 VAT — 라인별(총액+감가) 절사 합산, 실제 2026-07 세금계산서와 일치', () => {
      // 1,111.93톤 × 353,000 = 392,511,290 / 감가 180,851
      // VAT = floor(39,251,129.0) − floor(18,085.1) = 39,233,044
      // (차감 후 일괄 10% 절사면 39,233,043 — 동창 계산서와 1원 어긋남)
      const real = makeDelivery({
        product_name: 'BUNTAN', quantity_kg: 1_111_930,
        contract: { sell_price: 363_000, cost_price: 353_000, currency: 'KRW', reference_exchange_rate: null },
      })
      const [, cost] = genBuntan([real], '2026-08', 180_851)
      expect(cost.supply_amount).toBe(392_330_439)
      expect(cost.vat_amount).toBe(39_233_044)
      expect(cost.total_amount).toBe(431_563_483)
    })

    it('건별 감가(과거 데이터)와 월별 감가 동시 존재 시 각각 반영', () => {
      const legacy = makeDelivery({
        product_name: 'BUNTAN',
        depreciation_amount: 50_000,
        contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
      })
      const [sales, cost] = genBuntan([legacy], '2024-02', 100_000)
      expect(sales.supply_amount).toBe(1_950_000) // 2M − 50k(건별)만
      expect(cost.supply_amount).toBe(1_650_000)  // 1.8M − 50k(건별) − 100k(월별)
    })
  })
})

// ── genFeSi ───────────────────────────────────────────────
describe('genFeSi', () => {
  const fesi = makeDelivery({
    product_name: 'FESI75',
    delivery_date: '2024-01-10',
    fx_rate: 1400,
    contract: { sell_price: 1500, cost_price: 1200, currency: 'USD', reference_exchange_rate: 1350 },
  })

  it('항상 4장 반환', () => {
    expect(genFeSi(fesi, '2024-01')).toHaveLength(4)
  })

  it('VAT 10% — 4장 전부', () => {
    expect(genFeSi(fesi, '2024-01').every(i => i.vat_amount > 0)).toBe(true)
  })

  it('매출금액 = sell_price × qty_ton × fx_rate', () => {
    // 1500 × 10 × 1400 = 21_000_000
    const [sales] = genFeSi(fesi, '2024-01')
    expect(sales.supply_amount).toBe(21_000_000)
  })

  it('원가금액 = cost_price × qty_ton × fx_rate', () => {
    // 1200 × 10 × 1400 = 16_800_000
    const [, cost] = genFeSi(fesi, '2024-01')
    expect(cost.supply_amount).toBe(16_800_000)
  })

  it('커미션은 reference_exchange_rate 기준 (fx_rate 미사용)', () => {
    // calcCombinedMargin uses reference_exchange_rate=1350 (not fx_rate=1400)
    // margin = round((1500-1200) × 1350 × 10) = 4_050_000
    // splitMargin(4_050_000) → geumhwa: 1_350_000, raseong: 1_350_000
    const [, , gm, rs] = genFeSi(fesi, '2024-01')
    expect(gm.supply_amount).toBe(1_350_000)
    expect(rs.supply_amount).toBe(1_350_000)
  })

  it('fx_rate 없으면 reference_exchange_rate 폴백', () => {
    const d = makeDelivery({
      product_name: 'FESI75',
      fx_rate: null,
      contract: { sell_price: 1500, cost_price: 1200, currency: 'USD', reference_exchange_rate: 1350 },
    })
    // rate = 1350, sell = 1500 × 10 × 1350 = 20_250_000
    const [sales] = genFeSi(d, '2024-01')
    expect(sales.supply_amount).toBe(20_250_000)
  })
})

// ── genALSeries ───────────────────────────────────────────
describe('genALSeries', () => {
  describe('AL35B', () => {
    const d = makeDelivery({
      product_name: 'AL35B',
      contract: { sell_price: 1_900_000, cost_price: 1_800_000, currency: 'KRW', reference_exchange_rate: null },
    })

    it('4장 반환 — 금화 커미션 없음', () => {
      expect(genALSeries([d], '2024-02')).toHaveLength(4)
    })

    it('금화→한국에이원 = 원가 + 마진1/3 (AL35 전용 공식)', () => {
      // (1_800_000 + floor(100_000/3)) × 10 = 1_833_333 × 10 = 18_333_330
      const invoices = genALSeries([d], '2024-02')
      const gm2a1 = invoices.find(i => i.from_company === '금화' && i.to_company === '(주)한국에이원')!
      expect(gm2a1.supply_amount).toBe(18_333_330)
    })

    it('나성 커미션 = main.raseong', () => {
      // splitMargin(1_000_000).raseong = 333_334
      const invoices = genALSeries([d], '2024-02')
      const rs = invoices.find(i => i.to_company === '(주)나성')!
      expect(rs.supply_amount).toBe(333_334)
    })

    it('한국에이원→금화 커미션 행 없음', () => {
      const invoices = genALSeries([d], '2024-02')
      const gmComm = invoices.find(i => i.from_company === '(주)한국에이원' && i.to_company === '금화')
      expect(gmComm).toBeUndefined()
    })
  })

  describe('AL65B', () => {
    const d = makeDelivery({
      product_name: 'AL65B',
      product_id: 'prod-2',
      contract: { sell_price: 1_900_000, cost_price: 1_800_000, currency: 'KRW', reference_exchange_rate: null },
    })

    it('5장 반환 — 금화 커미션 포함', () => {
      expect(genALSeries([d], '2024-02')).toHaveLength(5)
    })

    it('금화→한국에이원 = costTotal (pass-through)', () => {
      // costTotal = 1_800_000 × 10 = 18_000_000
      const invoices = genALSeries([d], '2024-02')
      const gm2a1 = invoices.find(i => i.from_company === '금화' && i.to_company === '(주)한국에이원')!
      expect(gm2a1.supply_amount).toBe(18_000_000)
    })

    it('금화 커미션 = main.geumhwa', () => {
      // splitMargin(1_000_000).geumhwa = 333_333
      const invoices = genALSeries([d], '2024-02')
      const gmComm = invoices.find(i => i.from_company === '(주)한국에이원' && i.to_company === '금화')!
      expect(gmComm.supply_amount).toBe(333_333)
    })

    it('나성 커미션 = main.raseong', () => {
      // splitMargin(1_000_000).raseong = 333_334
      const invoices = genALSeries([d], '2024-02')
      const rs = invoices.find(i => i.to_company === '(주)나성')!
      expect(rs.supply_amount).toBe(333_334)
    })
  })
})

// ── genAL30 ───────────────────────────────────────────────
describe('genAL30', () => {
  function al30(date: string, id = 'd1'): DeliveryForInvoice {
    return makeDelivery({
      id, product_name: 'AL30', delivery_date: date,
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
  }

  it('모두 1~10일 — 1 sales + 1 cost + 2 commission = 4장', () => {
    expect(genAL30([al30('2024-01-05')], '2024-02')).toHaveLength(4)
  })

  it('10일 경계 — 1~10일 구간에 포함', () => {
    const invoices = genAL30([al30('2024-01-10')], '2024-02')
    expect(invoices.filter(i => i.invoice_type === 'sales')).toHaveLength(1)
  })

  it('11일 이상 — 11~20일 구간에 포함', () => {
    const d1 = al30('2024-01-05', 'd1')
    const d2 = al30('2024-01-11', 'd2')
    const salesInvoices = genAL30([d1, d2], '2024-02').filter(i => i.invoice_type === 'sales')
    expect(salesInvoices).toHaveLength(2)
  })

  it('2구간 납품 — 2 sales + 1 cost + 2 commission = 5장', () => {
    const d1 = al30('2024-01-05', 'd1')
    const d2 = al30('2024-01-15', 'd2')
    expect(genAL30([d1, d2], '2024-02')).toHaveLength(5)
  })

  it('원가 계산서 1장 — 전체 합산', () => {
    const d1 = al30('2024-01-05', 'd1')
    const d2 = al30('2024-01-15', 'd2')
    const costInvoices = genAL30([d1, d2], '2024-02').filter(i => i.invoice_type === 'cost')
    expect(costInvoices).toHaveLength(1)
    // totalCost = 1_800_000 + 1_800_000 = 3_600_000
    expect(costInvoices[0].supply_amount).toBe(3_600_000)
  })
})

// ── generateCommissionInvoices ────────────────────────────
describe('generateCommissionInvoices', () => {
  it('빈 입력 → []', () => {
    expect(generateCommissionInvoices([], '2024-02')).toHaveLength(0)
  })

  it('정상 커미션 — 3장 (수취 + 금화 + 나성)', () => {
    expect(generateCommissionInvoices([makeCommission()], '2024-02')).toHaveLength(3)
  })

  it('수취 — 전액 + VAT 10%', () => {
    // 300_000 + 30_000 = 330_000
    const [main] = generateCommissionInvoices([makeCommission()], '2024-02')
    expect(main.supply_amount).toBe(300_000)
    expect(main.vat_amount).toBe(30_000)
    expect(main.total_amount).toBe(330_000)
    expect(main.from_company).toBe('화림')
    expect(main.to_company).toBe('(주)한국에이원')
  })

  it('금화/나성 = 1/3 배분', () => {
    // splitMargin(300_000) = {100_000, 100_000, 100_000}
    const [, gm, rs] = generateCommissionInvoices([makeCommission()], '2024-02')
    expect(gm.supply_amount).toBe(100_000)
    expect(rs.supply_amount).toBe(100_000)
  })

  it('is_paid 항상 false', () => {
    const invoices = generateCommissionInvoices([makeCommission()], '2024-02')
    expect(invoices.every(i => i.is_paid === false)).toBe(true)
  })

  it('커미션 0원 — 1장만 (금화/나성 없음)', () => {
    // splitMargin(0) → geumhwa=0, raseong=0 → 조건 미충족 → 수취만
    const result = generateCommissionInvoices([makeCommission({ commission_amount: 0 })], '2024-02')
    expect(result).toHaveLength(1)
    expect(result[0].supply_amount).toBe(0)
  })
})

// ── generateInvoices ──────────────────────────────────────
describe('generateInvoices', () => {
  it('빈 입력 → []', () => {
    expect(generateInvoices([], '2024-02')).toHaveLength(0)
  })

  it('AL35B → genALSeries 라우팅 → 4장', () => {
    expect(generateInvoices([makeDelivery({ product_name: 'AL35B' })], '2024-02')).toHaveLength(4)
  })

  it('AL65B → genALSeries 라우팅 → 5장', () => {
    expect(generateInvoices([makeDelivery({ product_name: 'AL65B' })], '2024-02')).toHaveLength(5)
  })

  it('SOGGAE → genSoggae 라우팅 → 4장', () => {
    const d = makeDelivery({
      product_name: 'SOGGAE',
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
    expect(generateInvoices([d], '2024-02')).toHaveLength(4)
  })

  it('FESI75 → genFeSi 라우팅 → 4장', () => {
    const d = makeDelivery({
      product_name: 'FESI75',
      delivery_date: '2024-01-10',
      fx_rate: 1400,
      contract: { sell_price: 1500, cost_price: 1200, currency: 'USD', reference_exchange_rate: 1350 },
    })
    expect(generateInvoices([d], '2024-02')).toHaveLength(4)
  })

  it('미지원 품목명 → 0장, throw 없음', () => {
    const d = makeDelivery({ product_name: 'UNKNOWN_PRODUCT' })
    expect(() => generateInvoices([d], '2024-02')).not.toThrow()
    expect(generateInvoices([d], '2024-02')).toHaveLength(0)
  })
})

// ── generateInvoices 월별 감가 라우팅 ─────────────────────
describe('generateInvoices 월별 감가 라우팅', () => {
  it('BUNTAN 그룹의 product_id+납품월에 매칭되는 감가만 전달', () => {
    const d = makeDelivery({
      product_name: 'BUNTAN', product_id: 'prod-b', year_month: '2026-07',
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const invoices = generateInvoices([d], '2026-08', [
      { product_id: 'prod-b', year_month: '2026-07', amount: 100_000 },
      { product_id: 'prod-b', year_month: '2026-06', amount: 999_999 }, // 다른 달 — 무시
      { product_id: 'other',  year_month: '2026-07', amount: 999_999 }, // 다른 품목 — 무시
    ])
    const sales = invoices.find(i => i.invoice_type === 'sales')!
    expect(sales.supply_amount).toBe(2_000_000)
    const cost = invoices.find(i => i.invoice_type === 'cost')!
    expect(cost.supply_amount).toBe(1_700_000)
  })

  it('monthlyDeps 미전달 — 기존 동작 불변', () => {
    const d = makeDelivery({
      product_name: 'BUNTAN', product_id: 'prod-b', year_month: '2026-07',
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const sales = generateInvoices([d], '2026-08').find(i => i.invoice_type === 'sales')!
    expect(sales.supply_amount).toBe(2_000_000)
  })
})
