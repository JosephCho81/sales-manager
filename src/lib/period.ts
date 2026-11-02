/**
 * 목록 화면 기간 필터 (낙찰 단가·비용 정산 공용, 순수 함수)
 * 날짜는 모두 YYYY-MM-DD, 월은 YYYY-MM 문자열 비교로 판정한다.
 */
import { monthEnd, monthStart } from '@/lib/date'

export type PeriodMode = 'current' | 'month' | 'range' | 'all'

export type PeriodFilter = {
  mode: PeriodMode
  /** month 모드의 월, range 모드의 시작월 */
  from: string
  /** range 모드의 종료월 */
  to: string
}

/** 기간 [from, to]의 날짜 경계. all·current는 null(호출부 규칙) */
export function periodBounds(f: PeriodFilter): { start: string; end: string } | null {
  if (f.mode === 'month') return { start: monthStart(f.from), end: monthEnd(f.from) }
  if (f.mode === 'range') {
    const [a, b] = f.from <= f.to ? [f.from, f.to] : [f.to, f.from]
    return { start: monthStart(a), end: monthEnd(b) }
  }
  return null
}

/**
 * 계약 기간이 필터에 걸리는지.
 * current = 오늘 이후에도 유효한 단가(진행 중 + 시작 예정) — 지난 단가만 숨긴다.
 */
export function contractInPeriod(
  c: { start_date: string; end_date: string },
  f: PeriodFilter,
  today: string,
): boolean {
  const end = c.end_date.slice(0, 10)
  const start = c.start_date.slice(0, 10)
  if (f.mode === 'all') return true
  if (f.mode === 'current') return end >= today
  const b = periodBounds(f)!
  return start <= b.end && end >= b.start
}

/** 날짜 하나가 필터에 걸리는지. current는 이번 달로 본다 */
export function dateInPeriod(date: string, f: PeriodFilter, today: string): boolean {
  if (f.mode === 'all') return true
  const d = date.slice(0, 10)
  if (f.mode === 'current') return d.slice(0, 7) === today.slice(0, 7)
  const b = periodBounds(f)!
  return d >= b.start && d <= b.end
}
