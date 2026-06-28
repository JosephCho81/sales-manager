import { describe, it, expect } from 'vitest'
import {
  commissionTotal, commissionPreview, validateCommissionInput,
} from '@/app/(protected)/commission/commission-calc'

describe('commissionTotal', () => {
  it('물량 × 단가 (원 단위 반올림)', () => {
    expect(commissionTotal(50, 75000)).toBe(3_750_000)
    expect(commissionTotal(50.123, 75000)).toBe(Math.round(50.123 * 75000))
  })
  it('0.5 원은 반올림(올림)', () => {
    expect(commissionTotal(1.5, 333)).toBe(500) // 499.5 → 500
  })
})

describe('commissionPreview', () => {
  it('유효 입력 — 총액 + 3사 배분 항등성(a1+gm+rs=total)', () => {
    const p = commissionPreview('50', '75000')!
    expect(p.total).toBe(3_750_000)
    expect(p.korea_a1 + p.geumhwa + p.raseong).toBe(p.total)
  })
  it('물량/단가 0·음수·공백이면 null', () => {
    expect(commissionPreview('', '75000')).toBeNull()
    expect(commissionPreview('0', '75000')).toBeNull()
    expect(commissionPreview('-1', '75000')).toBeNull()
    expect(commissionPreview('50', '0')).toBeNull()
    expect(commissionPreview('50', '')).toBeNull()
  })
})

describe('validateCommissionInput', () => {
  it('공월 거부', () => {
    expect(validateCommissionInput('', '50', '75000')).toEqual({ ok: false, error: '기준 월을 입력하세요.' })
  })
  it('물량 0/음수/공백 거부', () => {
    for (const q of ['', '0', '-3']) {
      expect(validateCommissionInput('2026-06', q, '75000')).toEqual({ ok: false, error: '물량을 입력하세요.' })
    }
  })
  it('단가 0/음수/공백 거부', () => {
    for (const p of ['', '0', '-100']) {
      expect(validateCommissionInput('2026-06', '50', p)).toEqual({ ok: false, error: '화림 단가를 입력하세요.' })
    }
  })
  it('유효 입력 — payload 정확 (kg 변환·총액)', () => {
    const r = validateCommissionInput('2026-06', '50', '75000')
    expect(r).toEqual({
      ok: true,
      payload: { year_month: '2026-06', quantity_kg: 50_000, price_per_ton: 75000, commission_amount: 3_750_000 },
    })
  })
})
