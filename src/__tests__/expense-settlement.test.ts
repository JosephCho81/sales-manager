import { describe, it, expect } from 'vitest'
import {
  splitExpense, computeSettlement, computeUnassignedTotal, computeTransfers,
  validateExpenseInput, validateExpenseEdit,
} from '@/app/(protected)/expenses/expense-settlement'
import type { Expense, ExpensePayer } from '@/types'

function exp(amount: number, payer: ExpensePayer | null, is_settled = false): Expense {
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-06-01', description: 'x', amount, note: null,
    payer, is_settled, created_at: '2026-06-01T00:00:00Z',
  }
}

describe('splitExpense', () => {
  it('3등분, 나머지는 금화 귀속', () => {
    expect(splitExpense(3000)).toEqual({ korea_a1: 1000, raseong: 1000, geumhwa: 1000 })
    // 3100 / 3 = 1033.33 → base 1033, 금화가 나머지 흡수
    expect(splitExpense(3100)).toEqual({ korea_a1: 1033, raseong: 1033, geumhwa: 1034 })
  })
  it('합이 항상 원금과 일치 (반올림 손실 없음)', () => {
    for (const t of [1, 2, 7, 100, 99991, 1234567]) {
      const s = splitExpense(t)
      expect(s.korea_a1 + s.raseong + s.geumhwa).toBe(t)
    }
  })
})

describe('computeSettlement', () => {
  it('각 업체 share - paid = net', () => {
    const rows = [exp(3000, 'korea_a1'), exp(0, 'raseong')] // 총 3000, korea_a1이 전액 지불
    const s = computeSettlement(rows)
    expect(s.korea_a1).toEqual({ share: 1000, paid: 3000, net: -2000 }) // 2000 돌려받음
    expect(s.raseong).toEqual({ share: 1000, paid: 0, net: 1000 })      // 1000 내야 함
    expect(s.geumhwa).toEqual({ share: 1000, paid: 0, net: 1000 })
  })
  it('정산완료 행은 호출부에서 제외 — 빈 입력이면 모두 0', () => {
    const s = computeSettlement([])
    for (const p of ['korea_a1', 'raseong', 'geumhwa'] as ExpensePayer[]) {
      expect(s[p]).toEqual({ share: 0, paid: 0, net: 0 })
    }
  })
})

describe('computeUnassignedTotal', () => {
  it('지불 업체 미지정 행 합계만', () => {
    expect(computeUnassignedTotal([exp(500, null), exp(300, 'geumhwa'), exp(200, null)])).toBe(700)
  })
})

describe('computeTransfers', () => {
  it('낼 업체 → 받을 업체 그리디 매칭', () => {
    const s = computeSettlement([exp(3000, 'korea_a1')])
    const t = computeTransfers(s)
    // raseong(+1000), geumhwa(+1000) → korea_a1(-2000)
    expect(t).toEqual([
      { from: 'raseong', to: 'korea_a1', amount: 1000 },
      { from: 'geumhwa', to: 'korea_a1', amount: 1000 },
    ])
  })
  it('미지정분으로 낼 합 > 받을 합이면 잔여는 송금 제외 (정합)', () => {
    // 총 3000, 1500은 미지정 → korea_a1만 1500 지불
    const rows = [exp(1500, 'korea_a1'), exp(1500, null)]
    const s = computeSettlement(rows)
    const t = computeTransfers(s)
    const sent = t.reduce((sum, x) => sum + x.amount, 0)
    const creditNeed = (['korea_a1', 'raseong', 'geumhwa'] as ExpensePayer[])
      .reduce((sum, p) => sum + Math.max(0, -s[p].net), 0)
    expect(sent).toBe(creditNeed) // 받을 금액 한도까지만 송금
  })
  it('전원 균등 지불이면 송금 없음', () => {
    const rows = [exp(1000, 'korea_a1'), exp(1000, 'raseong'), exp(1000, 'geumhwa')]
    expect(computeTransfers(computeSettlement(rows))).toEqual([])
  })
})

describe('validateExpenseInput (신규 등록)', () => {
  it('날짜 없음 거부', () => {
    expect(validateExpenseInput('', '사무용품', '1000', 'korea_a1')).toEqual({ ok: false, error: '날짜를 입력하세요.' })
  })
  it('내역 공백 거부', () => {
    expect(validateExpenseInput('2026-06-01', '   ', '1000', 'korea_a1')).toEqual({ ok: false, error: '내역을 입력하세요.' })
  })
  it('금액 0·음수·비숫자 거부', () => {
    for (const a of ['', '0', '-5', 'abc']) {
      expect(validateExpenseInput('2026-06-01', '내역', a, 'korea_a1')).toEqual({ ok: false, error: '금액을 올바르게 입력하세요.' })
    }
  })
  it('지불 업체 미선택 거부', () => {
    expect(validateExpenseInput('2026-06-01', '내역', '1000', '')).toEqual({ ok: false, error: '지불 업체를 선택하세요.' })
  })
  it('유효 입력 — 내역 trim, payload 정확', () => {
    expect(validateExpenseInput('2026-06-01', '  사무용품  ', '1500', 'geumhwa')).toEqual({
      ok: true,
      payload: { date: '2026-06-01', description: '사무용품', amount: 1500, payer: 'geumhwa' },
    })
  })
})

describe('validateExpenseEdit (수정 — 지불 업체 불필요)', () => {
  it('금액 검증은 동일', () => {
    expect(validateExpenseEdit('2026-06-01', '내역', '0')).toEqual({ ok: false, error: '금액을 올바르게 입력하세요.' })
  })
  it('지불 업체 없이도 통과', () => {
    expect(validateExpenseEdit('2026-06-01', '내역', '2000')).toEqual({
      ok: true,
      payload: { date: '2026-06-01', description: '내역', amount: 2000 },
    })
  })
})
