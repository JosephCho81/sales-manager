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

  it('커미션 지급일 = 익월10일 (영업일이면 그대로)', () => {
    // 납품 2024-04 → 익월 2024-05-10 (금)
    const d4 = makeDelivery({ ...d, year_month: '2024-04', delivery_date: '2024-04-15' })
    const [, , gm, rs] = genSoggae([d4], '2024-05')
    for (const inv of [gm, rs]) {
      expect(inv.invoice_basis_date).toBe('2024-05-10')
      expect(inv.issue_deadline).toBe('2024-05-10')
      expect(inv.payment_due_date).toBe('2024-05-10')
    }
  })

  it('커미션 지급일이 휴일이면 앞당김 — 대금(익월10일)은 반대로 미룸', () => {
    // 납품 2024-01 → 2024-02-10(토, 설연휴). 커미션은 앞당겨 2024-02-08(목),
    // 매출·매입 대금은 기존대로 뒤로 밀려 2024-02-13(화)
    const [sales, cost, gm, rs] = genSoggae([d], '2024-02')
    expect(gm.payment_due_date).toBe('2024-02-08')
    expect(rs.payment_due_date).toBe('2024-02-08')
    expect(sales.payment_due_date).toBe('2024-02-13')
    expect(cost.payment_due_date).toBe('2024-02-13')
  })

  describe('월별 감가 — 통과형 (동국 감액 역발행 → 렘코 회수)', () => {
    // 2026-08 실데이터: 214.14톤 × (345,000 / 340,000), 감가 212,078원
    const real = makeDelivery({
      product_name: 'SOGGAE', product_id: 'soggae', year_month: '2026-08', quantity_kg: 214_140,
      contract: { sell_price: 345_000, cost_price: 340_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const pass = (amount: number, originYM: string) =>
      ({ amount, originYMs: [originYM], marginAmount: amount })
    const NONE = { amount: 0, originYMs: [] as string[], marginAmount: 0 }

    it('감가 없음 — 실계산서 금액과 일치 (회귀 기준)', () => {
      const [sales, cost, gm, rs] = genSoggae([real], '2026-09')
      expect(sales.supply_amount).toBe(73_878_300)
      expect(cost.supply_amount).toBe(72_807_600)
      expect(gm.supply_amount).toBe(356_900)
      expect(rs.supply_amount).toBe(356_900)
    })

    it('매출 감액월 — 동국 매출만 줄고 렘코 매입은 총액, 커미션도 함께 감액', () => {
      const [sales, cost, gm, rs] = genSoggae([real], '2026-09', NONE, pass(212_078, '2026-08'))
      expect(sales.supply_amount).toBe(73_666_222)
      expect(sales.vat_amount).toBe(0)              // 소괴탄 매출·매입은 면세
      expect(cost.supply_amount).toBe(72_807_600)
      // 마진 1,070,700 − 212,078 = 858,622 → floor/3 = 286,207
      expect(gm.supply_amount).toBe(286_207)
      expect(rs.supply_amount).toBe(286_208)
      expect(sales.memo).toContain('감가 212,078원 반영 발행')
      expect(gm.memo).toContain('3사 분담')
    })

    it('회수월 — 렘코 매입에서 차감되고 커미션이 되돌아온다', () => {
      const later = makeDelivery({ ...real, year_month: '2026-09' })
      const [sales, cost, gm, rs] = genSoggae([later], '2026-10', pass(212_078, '2026-08'), NONE)
      expect(sales.supply_amount).toBe(73_878_300)
      expect(cost.supply_amount).toBe(72_595_522)
      // 마진 1,070,700 + 212,078 = 1,282,778 → floor/3 = 427,592
      expect(gm.supply_amount).toBe(427_592)
      expect(rs.supply_amount).toBe(427_594)
      expect(cost.memo).toContain('감가 212,078원 차감')
      expect(gm.memo).toContain('3사 회수')
    })

    it('감액월 + 회수월 커미션 합 = 감가 없을 때와 동일 (왕복 상쇄)', () => {
      const sum = (inv: ReturnType<typeof genSoggae>) =>
        inv.filter(i => i.invoice_type === 'commission').reduce((s, i) => s + i.supply_amount, 0)
      const plain = sum(genSoggae([real], '2026-09')) * 2
      const round = sum(genSoggae([real], '2026-09', NONE, pass(212_078, '2026-08')))
                  + sum(genSoggae([real], '2026-10', pass(212_078, '2026-08'), NONE))
      // 마진 3분할이 floor 기반이라 감액·회수를 나눠 계산하면 최대 1원까지 어긋난다
      // (한국에이원 몫이 1원 흡수). 커미션이 통째로 새거나 이중 지급되지 않음을 확인하는 게 목적
      expect(Math.abs(round - plain)).toBeLessThanOrEqual(1)
    })

    it('보관형(marginAmount 0) — 매입만 차감하고 커미션은 총액 기준', () => {
      const hold = { amount: 212_078, originYMs: ['2026-08'], marginAmount: 0 }
      const [, cost, gm, rs] = genSoggae([real], '2026-09', hold, NONE)
      expect(cost.supply_amount).toBe(72_595_522)
      expect(gm.supply_amount).toBe(356_900)
      expect(rs.supply_amount).toBe(356_900)
    })
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

  it('커미션 지급일 = 익월10일, 휴일이면 앞당김 (대금은 반대로 미룸)', () => {
    const [sales, cost, gm, rs] = genBuntan([d], '2024-02')
    expect(gm.payment_due_date).toBe('2024-02-08')
    expect(rs.payment_due_date).toBe('2024-02-08')
    expect(sales.payment_due_date).toBe('2024-02-13')
    expect(cost.payment_due_date).toBe('2024-02-13')

    // 영업일이면 그대로: 납품 2024-04 → 2024-05-10(금)
    const d4 = makeDelivery({ ...d, year_month: '2024-04', delivery_date: '2024-04-15' })
    expect(genBuntan([d4], '2024-05')[2].payment_due_date).toBe('2024-05-10')
  })

  describe('월별 감가 (동창 미지급 — 2026-07 렘코 상장 대응)', () => {
    /** 보관형 — 매입만 차감하고 3사 배분은 총액 기준 유지 (marginAmount = 0) */
    const hold = (amount: number, vatActual?: number) =>
      ({ amount, originYMs: ['2024-01'], marginAmount: 0, vatActual })

    // sell 200_000 × 10톤 = 2_000_000 / cost 180_000 × 10톤 = 1_800_000
    it('매입(동창) 계산서만 차감, 매출(렘코)은 총액', () => {
      const [sales, cost] = genBuntan([d], '2024-02', hold(100_000))
      expect(sales.supply_amount).toBe(2_000_000)
      expect(cost.supply_amount).toBe(1_700_000)
    })

    it('커미션은 월별 감가 제외한 총액 기준 (과소지급 방지)', () => {
      const withDep = genBuntan([d], '2024-02', hold(100_000))
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
      const [, cost] = genBuntan([real], '2026-08', hold(180_851))
      expect(cost.supply_amount).toBe(392_330_439)
      expect(cost.vat_amount).toBe(39_233_044)
      expect(cost.total_amount).toBe(431_563_483)
    })

    // 2026-07 납품분은 6월분과 소수부 구조가 같은데도 실물이 반대(차감 후 일괄 절사)였다.
    // 한 공식으로 두 달을 맞출 수 없으므로 실물 세액을 입력받아 덮어쓴다.
    it('부가세 실계산서 값이 있으면 계산값을 덮어쓴다 (2026-07 납품분)', () => {
      // 1,050.06톤 × 353,000 = 370,671,180 / 감가 56,411
      // 계산값(라인별) = 37,067,118 − 5,641 = 37,061,477
      // 실물          = 37,061,476
      const real = makeDelivery({
        product_name: 'BUNTAN', quantity_kg: 1_050_060,
        contract: { sell_price: 363_000, cost_price: 353_000, currency: 'KRW', reference_exchange_rate: null },
      })
      const [, calc] = genBuntan([real], '2026-09', hold(56_411))
      expect(calc.vat_amount).toBe(37_061_477)

      const [, cost] = genBuntan([real], '2026-09', hold(56_411, 37_061_476))
      expect(cost.supply_amount).toBe(370_614_769)
      expect(cost.vat_amount).toBe(37_061_476)
      expect(cost.total_amount).toBe(407_676_245)
      expect(cost.memo).toContain('부가세 실계산서 값')
    })

    it('부가세 실계산서 0원도 유효 — null과 구분', () => {
      const [, cost] = genBuntan([d], '2024-02', hold(100_000, 0))
      expect(cost.vat_amount).toBe(0)
    })

    it('건별 감가(과거 데이터)와 월별 감가 동시 존재 시 각각 반영', () => {
      const legacy = makeDelivery({
        product_name: 'BUNTAN',
        depreciation_amount: 50_000,
        contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
      })
      const [sales, cost] = genBuntan([legacy], '2024-02', hold(100_000))
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

  it('VAT는 USD 부가세를 센트 단위로 절사 후 환율 환산 (2026-07 페로실리콘 실물 대사)', () => {
    // 실제 세금계산서: 공급가액 19,747,044원 / 부가세 1,974,703원
    // (공급가액 KRW × 10%를 바로 반올림하면 1,974,704로 1원 어긋남)
    const d = makeDelivery({
      product_name: 'FESI60',
      quantity_kg: 23_910,
      delivery_date: '2026-07-08',
      fx_rate: 1526.6,
      contract: { sell_price: 541, cost_price: 540, currency: 'USD', reference_exchange_rate: 1474.6 },
    })
    const [sales, cost] = genFeSi(d, '2026-07')
    expect(sales.supply_amount).toBe(19_747_044)
    expect(sales.vat_amount).toBe(1_974_703)
    expect(cost.vat_amount).toBe(1_971_054)
  })

  it('센트 절사 경계 — 1,303.269 USD → 절사 1,303.26 (2026-07 동국 역발행 대사)', () => {
    // 공급가액 13,032.69 USD × 환율 1531.80 = 19,963,475원
    // USD 부가세 1,303.269 → 절사 1,303.26 × 1531.80 = 1,996,334원 (반올림하면 1,303.27)
    const d = makeDelivery({
      product_name: 'FESI75',
      quantity_kg: 24_090,
      delivery_date: '2026-07-08',
      fx_rate: 1531.8,
      contract: { sell_price: 541, cost_price: 540, currency: 'USD', reference_exchange_rate: 1474.6 },
    })
    const [sales] = genFeSi(d, '2026-07')
    expect(sales.supply_amount).toBe(19_963_475)
    expect(sales.vat_amount).toBe(1_996_334)
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

    // 2026-07~ 화림 매입단가 2개 분할 (실데이터). 계약 2건 = 납품 2건으로 입력되며
    // 매출·매입·금화공급가·커미션이 전부 건별 합산으로 나와야 한다.
    describe('매입단가 2개 분할 (2026-07 실데이터)', () => {
      const base = {
        year_month: '2026-07', delivery_date: '2026-07-31',
        product_id: 'p-al35b', product_name: 'AL35B', product_vat: 'TEN_PERCENT' as const,
        depreciation_amount: null, fx_rate: null,
      }
      const lineA = makeDelivery({
        ...base, id: 'a', quantity_kg: 202_905,
        contract: { sell_price: 350_000, cost_price: 236_500, currency: 'KRW', reference_exchange_rate: null },
      })
      const lineB = makeDelivery({
        ...base, id: 'b', quantity_kg: 130_846,
        contract: { sell_price: 350_000, cost_price: 330_000, currency: 'KRW', reference_exchange_rate: null },
      })
      const invoices = genALSeries([lineA, lineB], '2026-09')

      it('매출 = 단일 매출단가 × 전체 물량', () => {
        // 350,000 × 333.751톤
        const s = invoices.find(i => i.invoice_type === 'sales')!
        expect(s.supply_amount).toBe(116_812_850)
      })

      it('화림 매입 = 두 단가 합산', () => {
        // 236,500×202.905 + 330,000×130.846
        const c = invoices.find(i => i.from_company === '화림')!
        expect(c.supply_amount).toBe(91_166_213)
      })

      it('금화→한국에이원 = 건별 (원가 + floor(톤당마진/3)) 합산', () => {
        // (236,500+37,833)×202.905 + (330,000+6,666)×130.846
        const gm = invoices.find(i => i.from_company === '금화')!
        expect(gm.supply_amount).toBe(99_714_937)
      })

      it('나성 커미션 = 건별 마진 합산의 1/3 배분 나머지', () => {
        // 23,029,718 + 2,616,920 = 25,646,638 → raseong
        const rs = invoices.find(i => i.to_company === '(주)나성')!
        expect(rs.supply_amount).toBe(8_548_880)
      })

      it('계산서 장수·묶음은 단일 계약 때와 동일 (4장, delivery_ids 2건)', () => {
        expect(invoices).toHaveLength(4)
        for (const i of invoices) expect(i.delivery_ids).toEqual(['a', 'b'])
      })
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

  // 2026-05 현대제철 감가 — docs/al30-depreciation-2026-05.md
  describe('감가 (통과형) — 매출 감액월', () => {
    const dep = { amount: 56_179, originYMs: ['2026-05'], marginAmount: 56_179 }
    const NONE = { amount: 0, originYMs: [] as string[], marginAmount: 0 }
    const gen  = (s = NONE, c = NONE) => genAL30([al30('2024-01-05')], '2024-02', c, s)

    it('매출(현대 역발행) 차감 — 총 61,797원 감소', () => {
      const base    = gen().find(i => i.invoice_type === 'sales')!
      const withDep = gen(dep).find(i => i.invoice_type === 'sales')!

      expect(base.supply_amount - withDep.supply_amount).toBe(56_179)
      // VAT는 감가액 기준 라인별 반올림(5,618)만큼만 줄어야 한다.
      // 차감 후 공급가에 일괄 10%를 다시 매기면 5,617이 되어 현대 실입금액과 1원 어긋남
      expect(base.vat_amount - withDep.vat_amount).toBe(5_618)
      expect(base.total_amount - withDep.total_amount).toBe(61_797)
    })

    it('매입(화림)은 그대로 — 감가 발생월에는 전액 지급', () => {
      const base    = gen().find(i => i.invoice_type === 'cost')!
      const withDep = gen(dep).find(i => i.invoice_type === 'cost')!
      expect(withDep.total_amount).toBe(base.total_amount)
    })

    it('커미션도 감액 — 3사가 감가를 나눠 부담', () => {
      const withDep = gen(dep).filter(i => i.invoice_type === 'commission')
      const sum = withDep.reduce((s, i) => s + i.supply_amount, 0)
      // 마진 (200,000−180,000)×10톤 = 200,000 → 감가 후 143,821, 1/3씩 47,940
      expect(withDep.map(i => i.supply_amount)).toEqual([47_940, 47_941])
      expect(sum).toBe(143_821 - Math.floor(143_821 / 3))
    })

    // 실제 2026-05 건: 마진 15,539,500 → 1/3 = 5,179,833(금화)·5,179,834(나성)
    // 감가 후 각 5,161,107. 공급가에 일괄 10%면 516,111이지만 실제 계산서는 516,110
    it('커미션 부가세도 라인별 — 감가분 VAT를 따로 빼야 실계산서와 일치', () => {
      const real = makeDelivery({
        id: 'r1', product_name: 'AL30', delivery_date: '2024-01-25', quantity_kg: 776_975,
        contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
      })
      const comm = genAL30([real], '2024-02', NONE, dep).filter(i => i.invoice_type === 'commission')

      expect(comm.map(i => i.supply_amount)).toEqual([5_161_107, 5_161_107])
      expect(comm.map(i => i.vat_amount)).toEqual([516_110, 516_110])
      expect(comm.map(i => i.total_amount)).toEqual([5_677_217, 5_677_217])
    })

    it('감가 없는 달은 일괄 10% 유지 — 기존 커미션 VAT 회귀', () => {
      const comm = gen().filter(i => i.invoice_type === 'commission')
      expect(comm.map(i => i.vat_amount)).toEqual([6_667, 6_667])
    })

    it('매출 감가는 마지막 발행 구간 1장에만 반영', () => {
      const sales = genAL30(
        [al30('2024-01-05', 'd1'), al30('2024-01-15', 'd2')], '2024-02', NONE, dep,
      ).filter(i => i.invoice_type === 'sales')
      expect(sales).toHaveLength(2)
      expect(sales[0].supply_amount).toBe(2_000_000)
      expect(sales[1].supply_amount).toBe(2_000_000 - 56_179)
    })

    it('memo에 귀속월과 감액 발행 사실 명시', () => {
      const sales = gen(dep).find(i => i.invoice_type === 'sales')!
      expect(sales.memo).toContain('5월분 감가')
      expect(sales.memo).toContain('반영 발행')
    })
  })

  describe('감가 (통과형) — 매입 회수월', () => {
    const dep = { amount: 56_179, originYMs: ['2026-05'], marginAmount: 56_179 }
    const NONE = { amount: 0, originYMs: [] as string[], marginAmount: 0 }
    const gen  = (c = NONE) => genAL30([al30('2024-01-05')], '2024-02', c)

    it('매입(화림) 계산서 차감 — 총 61,797원 감소', () => {
      const base    = gen().find(i => i.invoice_type === 'cost')!
      const withDep = gen(dep).find(i => i.invoice_type === 'cost')!
      expect(base.supply_amount - withDep.supply_amount).toBe(56_179)
      expect(base.vat_amount - withDep.vat_amount).toBe(5_618)
      expect(base.total_amount - withDep.total_amount).toBe(61_797)
    })

    it('매출은 불변 — 회수월 현대 계산서는 정상 금액', () => {
      const base    = gen().filter(i => i.invoice_type === 'sales')
      const withDep = gen(dep).filter(i => i.invoice_type === 'sales')
      expect(withDep.map(i => i.total_amount)).toEqual(base.map(i => i.total_amount))
    })

    it('커미션 증가 — 감액월에 부담한 만큼 3사가 되찾음', () => {
      const withDep = gen(dep).filter(i => i.invoice_type === 'commission')
      // 마진 200,000 + 회수 56,179 = 256,179 → 1/3씩 85,393
      expect(withDep.map(i => i.supply_amount)).toEqual([85_393, 85_393])
    })

    it('감가 미전달 — 기존 금액 불변 (과거 월 회귀)', () => {
      const cost = gen().find(i => i.invoice_type === 'cost')!
      expect(cost.supply_amount).toBe(1_800_000)
      expect(cost.vat_amount).toBe(180_000)
    })

    it('memo에 귀속월과 회수 사유 명시', () => {
      const cost = gen(dep).find(i => i.invoice_type === 'cost')!
      expect(cost.memo).toContain('5월분 감가')
      expect(cost.memo).toContain('현대 미입금분 회수')
    })
  })

  // 매출 감액 → 매입 회수 왕복 후 3사 배분이 원상복구되는지
  it('감가 왕복 — 두 달 합산 커미션이 감가 없을 때와 같음 (3사 배분 원단위 오차 ≤1원)', () => {
    const dep  = { amount: 56_179, originYMs: ['2026-05'], marginAmount: 56_179 }
    const NONE = { amount: 0, originYMs: [] as string[], marginAmount: 0 }
    const comm = (inv: ReturnType<typeof genAL30>) =>
      inv.filter(i => i.invoice_type === 'commission').reduce((s, i) => s + i.supply_amount, 0)

    const plain     = comm(genAL30([al30('2024-01-05')], '2024-02')) * 2
    const roundTrip = comm(genAL30([al30('2024-01-05')], '2024-02', NONE, dep))
                    + comm(genAL30([al30('2024-01-05')], '2024-02', dep, NONE))
    // 두 달에 걸쳐 1/3씩 나누므로 나머지 처리에서 최대 1원 어긋난다 (금액 소멸 아님)
    expect(Math.abs(roundTrip - plain)).toBeLessThanOrEqual(1)
  })
})

// ── generateInvoices: 감가 차감월 라우팅 ───────────────────
describe('generateInvoices — cost_deduct_ym 기준 매칭', () => {
  function al30At(ym: string): DeliveryForInvoice {
    return makeDelivery({
      id: `d-${ym}`, product_id: 'p-al30', product_name: 'AL30',
      year_month: ym, delivery_date: `${ym}-05`,
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
  }
  // 2026-05 귀속(매출 감액), 2026-07 납품분 매입에서 회수
  const deps = [{
    product_id: 'p-al30', year_month: '2026-05', amount: 56_179,
    sales_deduct_ym: '2026-05', cost_deduct_ym: '2026-07',
  }]

  it('매출 감액월(5월 납품분) 매출 계산서만 차감', () => {
    const inv = generateInvoices([al30At('2026-05')], '2026-07', deps)
    expect(inv.find(i => i.invoice_type === 'sales')!.supply_amount).toBe(2_000_000 - 56_179)
    expect(inv.find(i => i.invoice_type === 'cost')!.supply_amount).toBe(1_800_000)
  })

  it('회수월(7월 납품분) 매출은 불변', () => {
    const inv = generateInvoices([al30At('2026-07')], '2026-09', deps)
    expect(inv.find(i => i.invoice_type === 'sales')!.supply_amount).toBe(2_000_000)
  })

  it('회수월(7월 납품분)에만 차감', () => {
    const cost = generateInvoices([al30At('2026-07')], '2026-09', deps)
      .find(i => i.invoice_type === 'cost')!
    expect(cost.supply_amount).toBe(1_800_000 - 56_179)
  })

  it('귀속월(5월 납품분) 매입은 차감하지 않음 — 화림에 전액 지급', () => {
    const cost = generateInvoices([al30At('2026-05')], '2026-07', deps)
      .find(i => i.invoice_type === 'cost')!
    expect(cost.supply_amount).toBe(1_800_000)
  })

  it('중간월(6월 납품분)도 차감하지 않음 — 이중 차감 방지', () => {
    const cost = generateInvoices([al30At('2026-06')], '2026-08', deps)
      .find(i => i.invoice_type === 'cost')!
    expect(cost.supply_amount).toBe(1_800_000)
  })

  it('cost_deduct_ym 지정 감가는 그달 매입에서 차감', () => {
    const deps = [{ product_id: 'p-al30', year_month: '2026-07', amount: 10_000, sales_deduct_ym: null, cost_deduct_ym: '2026-07' }]
    const cost = generateInvoices([al30At('2026-07')], '2026-09', deps)
      .find(i => i.invoice_type === 'cost')!
    expect(cost.supply_amount).toBe(1_800_000 - 10_000)
  })

  // 계약 종료 후 현금으로 정산하는 감가 — 계산서에서 회수하면 이중 회수가 된다
  it('cost_deduct_ym이 null이면 매입 계산서에서 차감하지 않는다', () => {
    const deps = [{ product_id: 'p-al30', year_month: '2026-07', amount: 10_000, sales_deduct_ym: '2026-07', cost_deduct_ym: null }]
    const invoices = generateInvoices([al30At('2026-07')], '2026-09', deps)
    expect(invoices.find(i => i.invoice_type === 'cost')!.supply_amount).toBe(1_800_000)
    // 매출은 감액되고 커미션도 함께 줄어든다 (3사 분담분은 되돌아오지 않는다)
    expect(invoices.find(i => i.invoice_type === 'sales')!.supply_amount).toBe(2_000_000 - 10_000)
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
      { product_id: 'prod-b', year_month: '2026-07', amount: 100_000, sales_deduct_ym: null, cost_deduct_ym: '2026-07' },
      { product_id: 'prod-b', year_month: '2026-06', amount: 999_999, sales_deduct_ym: null, cost_deduct_ym: '2026-06' }, // 다른 달 — 무시
      { product_id: 'other',  year_month: '2026-07', amount: 999_999, sales_deduct_ym: null, cost_deduct_ym: '2026-07' }, // 다른 품목 — 무시
    ])
    const sales = invoices.find(i => i.invoice_type === 'sales')!
    expect(sales.supply_amount).toBe(2_000_000)
    const cost = invoices.find(i => i.invoice_type === 'cost')!
    expect(cost.supply_amount).toBe(1_700_000)
  })

  it('SOGGAE 통과형 — 매출 감액월엔 매출·커미션이 줄고 매입은 총액', () => {
    const d = makeDelivery({
      product_name: 'SOGGAE', product_id: 'soggae', year_month: '2026-08', quantity_kg: 214_140,
      contract: { sell_price: 345_000, cost_price: 340_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const invoices = generateInvoices([d], '2026-09', [
      { product_id: 'soggae', year_month: '2026-08', amount: 212_078,
        sales_deduct_ym: '2026-08', cost_deduct_ym: '2026-10' },
    ])
    expect(invoices.find(i => i.invoice_type === 'sales')!.supply_amount).toBe(73_666_222)
    expect(invoices.find(i => i.invoice_type === 'cost')!.supply_amount).toBe(72_807_600)
    const comm = invoices.filter(i => i.invoice_type === 'commission')
    expect(comm.map(i => i.supply_amount)).toEqual([286_207, 286_208])
  })

  it('SOGGAE 회수월 — 렘코 매입에서 차감, 커미션 복구', () => {
    const d = makeDelivery({
      product_name: 'SOGGAE', product_id: 'soggae', year_month: '2026-10', quantity_kg: 214_140,
      contract: { sell_price: 345_000, cost_price: 340_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const invoices = generateInvoices([d], '2026-11', [
      { product_id: 'soggae', year_month: '2026-08', amount: 212_078,
        sales_deduct_ym: '2026-08', cost_deduct_ym: '2026-10' },
    ])
    expect(invoices.find(i => i.invoice_type === 'cost')!.supply_amount).toBe(72_595_522)
    expect(invoices.filter(i => i.invoice_type === 'commission').map(i => i.supply_amount))
      .toEqual([427_592, 427_594])
  })

  it('보관형(sales_deduct_ym 없음)은 커미션을 움직이지 않는다 — 분탄 회귀', () => {
    const d = makeDelivery({
      product_name: 'BUNTAN', product_id: 'prod-b', year_month: '2026-07',
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const withDep = generateInvoices([d], '2026-08', [
      { product_id: 'prod-b', year_month: '2026-07', amount: 100_000, sales_deduct_ym: null, cost_deduct_ym: '2026-07' },
    ]).filter(i => i.invoice_type === 'commission').map(i => i.supply_amount)
    const noDep = generateInvoices([d], '2026-08')
      .filter(i => i.invoice_type === 'commission').map(i => i.supply_amount)
    expect(withDep).toEqual(noDep)
  })

  it('monthlyDeps 미전달 — 기존 동작 불변', () => {
    const d = makeDelivery({
      product_name: 'BUNTAN', product_id: 'prod-b', year_month: '2026-07',
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const sales = generateInvoices([d], '2026-08').find(i => i.invoice_type === 'sales')!
    expect(sales.supply_amount).toBe(2_000_000)
  })

  describe('cost_vat_actual 전달', () => {
    const d = makeDelivery({
      product_name: 'BUNTAN', product_id: 'prod-b', year_month: '2026-07',
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const costOf = (deps: Parameters<typeof generateInvoices>[2]) =>
      generateInvoices([d], '2026-08', deps).find(i => i.invoice_type === 'cost')!

    it('매칭 감가의 실물 세액이 매입 계산서에 그대로 반영', () => {
      // 계산값이면 floor(180,000) − floor(10,000) = 170,000
      expect(costOf([{ product_id: 'prod-b', year_month: '2026-07', amount: 100_000, cost_vat_actual: 169_999, sales_deduct_ym: null, cost_deduct_ym: '2026-07' }])
        .vat_amount).toBe(169_999)
    })

    it('다른 품목·다른 차감월의 실물 세액은 무시', () => {
      expect(costOf([
        { product_id: 'prod-b', year_month: '2026-07', amount: 100_000, sales_deduct_ym: null, cost_deduct_ym: '2026-07' },
        { product_id: 'other',  year_month: '2026-07', amount: 100_000, cost_vat_actual: 1, sales_deduct_ym: null, cost_deduct_ym: '2026-07' },
        { product_id: 'prod-b', year_month: '2026-06', amount: 100_000, cost_vat_actual: 2, sales_deduct_ym: null, cost_deduct_ym: '2026-06' },
      ]).vat_amount).toBe(170_000)
    })

    // 계산서 한 장의 세액이라 합산이 불가능하다 — 어느 값이 진짜인지 못 정하면 계산값으로
    it('같은 달 감가 2건이 서로 다른 세액을 주장하면 계산값으로 폴백', () => {
      expect(costOf([
        { product_id: 'prod-b', year_month: '2026-07', amount: 60_000, cost_deduct_ym: '2026-07', cost_vat_actual: 111, sales_deduct_ym: null },
        { product_id: 'prod-b', year_month: '2026-06', amount: 40_000, cost_deduct_ym: '2026-07', cost_vat_actual: 222, sales_deduct_ym: null },
      ]).vat_amount).toBe(170_000)
    })
  })
})
