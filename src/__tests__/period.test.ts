import { describe, it, expect } from 'vitest'
import { contractInPeriod, dateInPeriod, type PeriodFilter } from '@/lib/period'
import { summarizeByMonth } from '@/app/(protected)/expenses/expense-settlement'

const TODAY = '2026-11-02'
const f = (mode: PeriodFilter['mode'], from = '2026-11', to = '2026-11'): PeriodFilter => ({ mode, from, to })

describe('contractInPeriod', () => {
  const past    = { start_date: '2026-01-01', end_date: '2026-06-30' }
  const running = { start_date: '2026-07-01', end_date: '2026-12-31' }
  const future  = { start_date: '2027-01-01', end_date: '2027-06-30' }
  const endsToday = { start_date: '2026-10-01', end_date: TODAY }

  it('현재 = 지난 단가만 숨기고 진행 중·시작 예정은 보인다', () => {
    expect(contractInPeriod(past, f('current'), TODAY)).toBe(false)
    expect(contractInPeriod(running, f('current'), TODAY)).toBe(true)
    expect(contractInPeriod(future, f('current'), TODAY)).toBe(true)
    expect(contractInPeriod(endsToday, f('current'), TODAY)).toBe(true)
  })
  it('기간 = 겹치는 단가, 시작·종료월이 뒤바뀌어도 같은 결과', () => {
    expect(contractInPeriod(past, f('range', '2026-06', '2026-07'), TODAY)).toBe(true)
    expect(contractInPeriod(future, f('range', '2026-06', '2026-07'), TODAY)).toBe(false)
    expect(contractInPeriod(past, f('range', '2026-07', '2026-06'), TODAY)).toBe(true)
  })
  it('전체 = 모두', () => {
    expect(contractInPeriod(past, f('all'), TODAY)).toBe(true)
  })
})

describe('dateInPeriod', () => {
  it('월 모드는 말일까지 포함', () => {
    expect(dateInPeriod('2026-02-28', f('month', '2026-02'), TODAY)).toBe(true)
    expect(dateInPeriod('2026-03-01', f('month', '2026-02'), TODAY)).toBe(false)
  })
  it('기간 모드', () => {
    expect(dateInPeriod('2026-08-15', f('range', '2026-07', '2026-09'), TODAY)).toBe(true)
    expect(dateInPeriod('2026-10-01', f('range', '2026-07', '2026-09'), TODAY)).toBe(false)
  })
})

describe('summarizeByMonth', () => {
  it('월별·지불업체별 합계, 미지정 분리, 월 내림차순', () => {
    const r = summarizeByMonth([
      { date: '2026-09-03', amount: 100000, payer: 'korea_a1' },
      { date: '2026-10-10', amount: 50000, payer: 'geumhwa' },
      { date: '2026-10-20', amount: 30000, payer: null },
      { date: '2026-10-21', amount: 20000, payer: 'geumhwa' },
    ])
    expect(r.map(m => m.ym)).toEqual(['2026-10', '2026-09'])
    expect(r[0]).toMatchObject({ total: 100000, count: 3, unassigned: 30000 })
    expect(r[0].byPayer.geumhwa).toBe(70000)
    expect(r[1].byPayer.korea_a1).toBe(100000)
  })
})
