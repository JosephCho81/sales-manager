import { describe, it, expect } from 'vitest'
import { parseMonthlyDepInput, sumUnsettled } from '@/lib/depreciation'

describe('parseMonthlyDepInput', () => {
  it('정상 입력 — 숫자 문자열/콤마 허용, memo trim', () => {
    const r = parseMonthlyDepInput({ year_month: '2026-07', amount: '1,000,000', memo: ' 7월분 ' })
    expect(r).toEqual({ ok: true, year_month: '2026-07', amount: 1_000_000, memo: '7월분' })
  })

  it('음수/0/소수/비숫자 거부', () => {
    for (const bad of ['-1000', '0', '100.5', 'abc', '']) {
      expect(parseMonthlyDepInput({ year_month: '2026-07', amount: bad }).ok).toBe(false)
    }
  })

  it('월 형식 검증 — YYYY-MM만 허용', () => {
    for (const bad of ['2026-13', '2026-7', '202607', '2026-07-01']) {
      expect(parseMonthlyDepInput({ year_month: bad, amount: '1000' }).ok).toBe(false)
    }
  })

  it('빈 memo → null', () => {
    const r = parseMonthlyDepInput({ year_month: '2026-07', amount: 1000 })
    expect(r).toEqual({ ok: true, year_month: '2026-07', amount: 1000, memo: null })
  })
})

describe('sumUnsettled', () => {
  it('settled_at null만 합산', () => {
    expect(sumUnsettled([
      { amount: 100_000, settled_at: null },
      { amount: 50_000,  settled_at: '2026-10-01T00:00:00Z' },
      { amount: 30_000,  settled_at: null },
    ])).toBe(130_000)
  })

  it('빈 배열 → 0', () => {
    expect(sumUnsettled([])).toBe(0)
  })
})
