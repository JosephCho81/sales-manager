import { describe, it, expect } from 'vitest'
import { splitMargin, calcMargin, calcMarginFromContract } from '@/lib/margin'

// ── splitMargin ──────────────────────────────────────────
describe('splitMargin', () => {
  it('합계 항등성 — 어떤 금액도 3사 합계가 원래 값과 같아야 한다', () => {
    for (const total of [1, 100, 999, 1000, 10001, 999_999_999]) {
      const { korea_a1, geumhwa, raseong } = splitMargin(total)
      expect(korea_a1 + geumhwa + raseong).toBe(total)
    }
  })

  it('라성이 나머지를 가져간다 (1000원 → 333 + 333 + 334)', () => {
    const { korea_a1, geumhwa, raseong } = splitMargin(1000)
    expect(korea_a1).toBe(333)
    expect(geumhwa).toBe(333)
    expect(raseong).toBe(334)
  })

  it('정확히 3등분 (300원 → 100 + 100 + 100)', () => {
    const { korea_a1, geumhwa, raseong } = splitMargin(300)
    expect(korea_a1).toBe(100)
    expect(geumhwa).toBe(100)
    expect(raseong).toBe(100)
  })

  it('음수 마진도 합계 항등성 유지', () => {
    const { korea_a1, geumhwa, raseong } = splitMargin(-300)
    expect(korea_a1 + geumhwa + raseong).toBe(-300)
  })

  it('0원', () => {
    const { korea_a1, geumhwa, raseong } = splitMargin(0)
    expect(korea_a1).toBe(0)
    expect(geumhwa).toBe(0)
    expect(raseong).toBe(0)
  })
})

// ── calcMargin ───────────────────────────────────────────
describe('calcMargin', () => {
  it('KRW 마진 기본 계산 (50톤, 마진 100원/톤 → 총 5,000원)', () => {
    const result = calcMargin(1_900_100, 1_900_000, 50_000)
    expect(result.quantity_ton).toBe(50)
    expect(result.total_margin).toBe(5_000)
  })

  it('마진 합계 항등성', () => {
    const result = calcMargin(2_000_000, 1_800_000, 30_000)
    expect(result.korea_a1 + result.geumhwa + result.raseong).toBe(result.total_margin)
  })

  it('물량 0kg → 마진 0', () => {
    const result = calcMargin(2_000_000, 1_800_000, 0)
    expect(result.total_margin).toBe(0)
    expect(result.quantity_ton).toBe(0)
  })

  it('반올림 처리 — total_margin은 정수', () => {
    const result = calcMargin(1_000_001, 1_000_000, 1_000) // 마진 1원/톤, 1톤
    expect(Number.isInteger(result.total_margin)).toBe(true)
  })
})

// ── calcMarginFromContract ───────────────────────────────
describe('calcMarginFromContract', () => {
  it('KRW 계약 — 환율 불필요, exchange_rate_used는 null', () => {
    const contract = {
      sell_price: 1_900_000,
      cost_price: 1_800_000,
      currency: 'KRW',
      reference_exchange_rate: null,
    }
    const result = calcMarginFromContract(contract, 10_000) // 10톤
    expect(result.exchange_rate_used).toBeNull()
    expect(result.total_margin).toBe(1_000_000) // 100,000원/톤 × 10톤
    expect(result.sell_price_krw).toBe(1_900_000)
    expect(result.cost_price_krw).toBe(1_800_000)
  })

  it('USD 계약 — 환율 적용', () => {
    const contract = {
      sell_price: 1500,
      cost_price: 1200,
      currency: 'USD',
      reference_exchange_rate: 1400,
    }
    const result = calcMarginFromContract(contract, 10_000) // 10톤
    expect(result.exchange_rate_used).toBe(1400)
    expect(result.sell_price_krw).toBe(1500 * 1400)
    expect(result.cost_price_krw).toBe(1200 * 1400)
    expect(result.total_margin).toBe((1500 - 1200) * 1400 * 10)
  })

  it('USD 계약인데 참고환율 null → 에러 throw (데이터 정합성 오류)', () => {
    const contract = {
      sell_price: 1500,
      cost_price: 1200,
      currency: 'USD',
      reference_exchange_rate: null,
    }
    expect(() => calcMarginFromContract(contract, 10_000)).toThrow()
  })

  it('USD 계약인데 환율 0 → 에러 throw', () => {
    const contract = {
      sell_price: 1500,
      cost_price: 1200,
      currency: 'USD',
      reference_exchange_rate: 0,
    }
    expect(() => calcMarginFromContract(contract, 10_000)).toThrow()
  })

  it('마진 합계 항등성 (KRW)', () => {
    const contract = {
      sell_price: 2_000_000,
      cost_price: 1_700_000,
      currency: 'KRW',
      reference_exchange_rate: null,
    }
    const { total_margin, korea_a1, geumhwa, raseong } = calcMarginFromContract(contract, 50_000)
    expect(korea_a1 + geumhwa + raseong).toBe(total_margin)
  })
})
