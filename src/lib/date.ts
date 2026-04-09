// ────────────────────────────────────────────────────────
// 공통 날짜 유틸
// ────────────────────────────────────────────────────────

export function parseYM(ym: string): [number, number] {
  const [y, m] = ym.split('-').map(Number)
  return [y, m]
}

/** YYYY-MM에 n개월 더하기 */
export function shiftMonths(ym: string, n: number): string {
  const [y, m] = parseYM(ym)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** YYYY-MM의 마지막 날 (YYYY-MM-DD) */
export function monthEnd(ym: string): string {
  const [y, m] = parseYM(ym)
  return new Date(y, m, 0).toISOString().slice(0, 10)
}

/** YYYY-MM의 첫날 (YYYY-MM-DD) */
export function monthStart(ym: string): string {
  return `${ym}-01`
}

/** YYYY-MM의 N일 (YYYY-MM-DD) */
export function nthDay(ym: string, day: number): string {
  return `${ym}-${String(day).padStart(2, '0')}`
}

/** 날짜 문자열에 N일 더하기 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** YYYY-MM-DD → YYYY-MM */
export function toYearMonth(date: string): string {
  return date.slice(0, 7)
}

/** 오늘 날짜 (YYYY-MM-DD) */
export function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 현재 연월 (YYYY-MM) */
export function getCurrentYearMonth(): string {
  return getTodayDate().slice(0, 7)
}
