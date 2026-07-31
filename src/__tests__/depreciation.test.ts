import { describe, it, expect } from 'vitest'
import {
  parseMonthlyDepInput, sumUnsettled, sumUnrecovered,
  depKind, splitShortfall, parsePaidAmount, depBadgeFor, depBreakdownFor,
} from '@/lib/depreciation'
import type { MonthlyDepreciation } from '@/types'

describe('parseMonthlyDepInput', () => {
  it('정상 입력 — 숫자 문자열/콤마 허용, memo trim, 차감월 기본값=당월', () => {
    const r = parseMonthlyDepInput({ year_month: '2026-07', amount: '1,000,000', memo: ' 7월분 ' })
    expect(r).toEqual({
      ok: true, year_month: '2026-07', amount: 1_000_000, memo: '7월분',
      sales_deduct_ym: null, cost_deduct_ym: '2026-07',
    })
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
    expect(r).toMatchObject({ ok: true, memo: null })
  })

  it('통과형 — 매출 감액월·매입 회수월 분리 저장', () => {
    const r = parseMonthlyDepInput({
      year_month: '2026-05', amount: 56_179,
      sales_deduct_ym: '2026-05', cost_deduct_ym: '2026-07',
    })
    expect(r).toMatchObject({ ok: true, sales_deduct_ym: '2026-05', cost_deduct_ym: '2026-07' })
  })

  it('차감월 형식 오류 거부', () => {
    expect(parseMonthlyDepInput({ year_month: '2026-05', amount: 1000, cost_deduct_ym: '2026-13' }).ok).toBe(false)
    expect(parseMonthlyDepInput({ year_month: '2026-05', amount: 1000, sales_deduct_ym: 'x' }).ok).toBe(false)
  })
})

// ── 유형 분리 ─────────────────────────────────────────────
const hold = { amount: 100_000, settled_at: null, sales_deduct_ym: null }
const pass = { amount: 56_179,  settled_at: null, sales_deduct_ym: '2026-05' }

describe('depKind / 누계', () => {
  it('sales_deduct_ym 유무로 보관형·통과형 구분', () => {
    expect(depKind(hold)).toBe('hold')
    expect(depKind(pass)).toBe('passthrough')
  })

  it('sumUnsettled — 보관형 미정산만 합산 (통과형 제외)', () => {
    expect(sumUnsettled([
      hold,
      { amount: 50_000, settled_at: '2026-10-01T00:00:00Z', sales_deduct_ym: null },
      { amount: 30_000, settled_at: null, sales_deduct_ym: null },
      pass,
    ])).toBe(130_000)
  })

  it('sumUnrecovered — 통과형 미회수만 합산', () => {
    expect(sumUnrecovered([hold, pass])).toBe(56_179)
    expect(sumUnrecovered([{ ...pass, settled_at: '2026-09-30T00:00:00Z' }])).toBe(0)
  })

  it('빈 배열 → 0', () => {
    expect(sumUnsettled([])).toBe(0)
    expect(sumUnrecovered([])).toBe(0)
  })
})

// ── 실입금 차액 역산 ───────────────────────────────────────
describe('splitShortfall', () => {
  it('2026-05 AL30 실제 건 — 61,797 = 56,179 + 5,618', () => {
    expect(splitShortfall(61_797, true)).toEqual({ ok: true, diff: 61_797, supply: 56_179, vat: 5_618 })
  })

  it('부가세 없는 계산서는 전액이 공급가액', () => {
    expect(splitShortfall(50_000, false)).toEqual({ ok: true, diff: 50_000, supply: 50_000, vat: 0 })
  })

  it('부가세 규칙과 안 맞는 차액은 거부 — 감가 외 원인', () => {
    // 공급가액+반올림VAT 조합으로 만들 수 없는 금액 (예: 61,792 / 61,803 / 5)
    expect(splitShortfall(61_792, true).ok).toBe(false)
    expect(splitShortfall(61_803, true).ok).toBe(false)
    expect(splitShortfall(5, true).ok).toBe(false)
  })

  it('0·음수·소수 거부', () => {
    for (const bad of [0, -100, 1000.5]) expect(splitShortfall(bad, true).ok).toBe(false)
  })
})

describe('parsePaidAmount', () => {
  it('실제 건 — 차액 61,797 산출', () => {
    expect(parsePaidAmount('159,249,157', 159_310_954)).toEqual({
      ok: true, amount: 159_249_157, diff: 61_797,
    })
  })

  it('총액과 같으면 차액 0', () => {
    expect(parsePaidAmount(131_961_434, 131_961_434)).toMatchObject({ ok: true, diff: 0 })
  })

  it('총액 초과 입금은 거부 (오입력 방지)', () => {
    expect(parsePaidAmount(200, 100).ok).toBe(false)
  })

  it('음수·소수·비숫자 거부', () => {
    for (const bad of ['-1', '10.5', 'abc', '']) expect(parsePaidAmount(bad, 1000).ok).toBe(false)
  })
})

// ── 계산서 배지 (담당자 실수 방지의 핵심) ──────────────────
const AL30 = 'p-al30'
const dep2605: MonthlyDepreciation = {
  id: 'd1', product_id: AL30, year_month: '2026-05', amount: 56_179,
  memo: null, settled_at: null,
  sales_deduct_ym: '2026-05', cost_deduct_ym: '2026-07',
  created_at: '2026-07-31T00:00:00Z',
}
const inv = (o: Partial<Parameters<typeof depBadgeFor>[0]>) => ({
  invoice_type: 'cost', product_id: AL30, delivery_year_month: '2026-06',
  from_company: '(주)한국에이원', to_company: '화림', ...o,
})

describe('depBadgeFor', () => {
  it('매출(5월분) — 감액 발행 사실 + 회수 예정월 안내', () => {
    const b = depBadgeFor(inv({ invoice_type: 'sales', delivery_year_month: '2026-05', from_company: '현대제철' }), [dep2605])
    expect(b?.tone).toBe('shortfall')
    expect(b?.text).toContain('반영 발행')
    expect(b?.text).toContain('실제 역발행·입금액과 일치')
    expect(b?.text).toContain('7월분 매입에서 회수')
  })

  it('매입 6월분 — "차감 없음" 명시 (이중 차감 방지)', () => {
    const b = depBadgeFor(inv({ delivery_year_month: '2026-06' }), [dep2605])
    expect(b?.tone).toBe('pending')
    expect(b?.text).toContain('차감 없음')
    expect(b?.text).toContain('전액 지급')
    expect(b?.text).toContain('7월분에서 회수 예정')
  })

  it('매입 7월분 — 회수 반영 발행 표시', () => {
    const b = depBadgeFor(inv({ delivery_year_month: '2026-07' }), [dep2605])
    expect(b?.tone).toBe('applied')
    expect(b?.text).toContain('56,179')
    expect(b?.text).toContain('회수 완료')
  })

  it('회수 완료(settled) 후에는 대기 배지를 띄우지 않음', () => {
    const settled = { ...dep2605, settled_at: '2026-09-30T00:00:00Z' }
    expect(depBadgeFor(inv({ delivery_year_month: '2026-06' }), [settled])).toBeNull()
  })

  it('보관형(분탄)은 매출 배지 없음 / 매입은 보관 표시', () => {
    const buntan: MonthlyDepreciation = {
      ...dep2605, id: 'd2', product_id: 'p-buntan', year_month: '2026-06',
      sales_deduct_ym: null, cost_deduct_ym: '2026-06',
    }
    const salesInv = inv({ invoice_type: 'sales', product_id: 'p-buntan', delivery_year_month: '2026-06' })
    expect(depBadgeFor(salesInv, [buntan])).toBeNull()
    const costInv = inv({ product_id: 'p-buntan', delivery_year_month: '2026-06' })
    expect(depBadgeFor(costInv, [buntan])?.tone).toBe('hold')
  })

  it('커미션(5월분) — 감가 차감 마진 기준임을 명시', () => {
    const b = depBadgeFor(inv({ invoice_type: 'commission', delivery_year_month: '2026-05', to_company: '금화' }), [dep2605])
    expect(b?.tone).toBe('shortfall')
    expect(b?.text).toContain('뺀 마진 기준')
    expect(b?.text).toContain('3사가 나눠 부담')
  })

  it('커미션(7월분) — 회수분 포함 마진 기준임을 명시', () => {
    const b = depBadgeFor(inv({ invoice_type: 'commission', delivery_year_month: '2026-07', to_company: '금화' }), [dep2605])
    expect(b?.tone).toBe('applied')
    expect(b?.text).toContain('회수분을 더한 마진 기준')
  })

  it('다른 품목·품목 없는 커미션 계산서는 배지 없음', () => {
    expect(depBadgeFor(inv({ product_id: 'other' }), [dep2605])).toBeNull()
    expect(depBadgeFor(inv({ product_id: null, invoice_type: 'commission' }), [dep2605])).toBeNull()
    // 6월분 커미션 — 감가와 무관한 달
    expect(depBadgeFor(inv({ invoice_type: 'commission', delivery_year_month: '2026-06' }), [dep2605])).toBeNull()
  })
})

// ── 계산서 행 감가 산식 ────────────────────────────────────
describe('depBreakdownFor', () => {
  const amt = (o: Record<string, unknown>) => ({
    invoice_type: 'cost', product_id: AL30, delivery_year_month: '2026-07',
    from_company: '(주)한국에이원', to_company: '화림',
    supply_amount: 0, vat_amount: 0, total_amount: 0, ...o,
  })

  it('매출 감액월 — 반영 전 금액 복원 (실제 2026-05 건)', () => {
    const bd = depBreakdownFor(amt({
      invoice_type: 'sales', delivery_year_month: '2026-05',
      from_company: '현대제철', to_company: '(주)한국에이원',
      supply_amount: 144_771_961, vat_amount: 14_477_196, total_amount: 159_249_157,
    }), [dep2605])!
    expect(bd.grossSupply).toBe(144_828_140)
    expect(bd.grossVat).toBe(14_482_814)
    expect(bd.grossTotal).toBe(159_310_954)
    expect(bd.depTotal).toBe(61_797)
    expect(bd.depVat).toBe(5_618)
    expect(bd.netTotal).toBe(159_249_157)
    expect(bd.originYMs).toEqual(['2026-05'])
  })

  it('매입 회수월 — 화림 계산서 산식', () => {
    const bd = depBreakdownFor(amt({
      supply_amount: 1_000_000, vat_amount: 100_000, total_amount: 1_100_000,
    }), [dep2605])!
    expect(bd.grossSupply).toBe(1_056_179)
    expect(bd.depTotal).toBe(61_797)
    expect(bd.netTotal).toBe(1_100_000)
  })

  it('동창(보관형)은 부가세 절사 관례 적용', () => {
    const buntan: MonthlyDepreciation = {
      ...dep2605, id: 'd3', product_id: 'p-buntan', year_month: '2026-06',
      amount: 180_851, sales_deduct_ym: null, cost_deduct_ym: '2026-06',
    }
    const bd = depBreakdownFor(amt({
      product_id: 'p-buntan', delivery_year_month: '2026-06', to_company: '동창',
      supply_amount: 392_330_439, vat_amount: 39_233_044, total_amount: 431_563_483,
    }), [buntan])!
    expect(bd.depVat).toBe(18_085) // 절사 (반올림이면 18,085.1 → 18,085 동일하나 규칙 명시)
    expect(bd.grossSupply).toBe(392_511_290)
  })

  it('감가 없는 행·커미션 행은 산식 없음', () => {
    expect(depBreakdownFor(amt({ delivery_year_month: '2026-06' }), [dep2605])).toBeNull()
    expect(depBreakdownFor(amt({ invoice_type: 'commission', delivery_year_month: '2026-05' }), [dep2605])).toBeNull()
  })

  it('부가세 없는 계산서는 감가 VAT 0', () => {
    const bd = depBreakdownFor(amt({
      supply_amount: 1_000_000, vat_amount: 0, total_amount: 1_000_000,
    }), [dep2605])!
    expect(bd.depVat).toBe(0)
    expect(bd.depTotal).toBe(56_179)
  })
})
