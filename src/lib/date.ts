// ────────────────────────────────────────────────────────
// 공통 날짜 유틸
// ────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  const d = new Date(y, m, 0)
  return fmtDate(d)
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
  const [y, m, dd] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1, dd + days)
  return fmtDate(d)
}

/** YYYY-MM-DD → YYYY-MM */
export function toYearMonth(date: string): string {
  return date.slice(0, 7)
}

/** 오늘 날짜 (YYYY-MM-DD) */
export function getTodayDate(): string {
  return fmtDate(new Date())
}

/** 현재 연월 (YYYY-MM) */
export function getCurrentYearMonth(): string {
  return getTodayDate().slice(0, 7)
}

// ────────────────────────────────────────────────────────
// 한국 공휴일 + 워킹데이 계산
// ────────────────────────────────────────────────────────

// 고정 공휴일 (매년 동일, MM-DD)
const FIXED_HOLIDAYS_MD: ReadonlySet<string> = new Set([
  '01-01', // 신정
  '03-01', // 삼일절
  '05-05', // 어린이날
  '06-06', // 현충일
  '08-15', // 광복절
  '10-03', // 개천절
  '10-09', // 한글날
  '12-25', // 성탄절
])

/**
 * 음력 기반 공휴일 + 대체공휴일 (YYYY-MM-DD) — 매년 검토 및 갱신 필요
 * 설날 연휴: 음력 1/1 전후 3일, 추석 연휴: 음력 8/15 전후 3일
 * 대체공휴일: 공휴일이 토/일 또는 다른 공휴일과 겹칠 때 다음 평일
 */
const VARIABLE_HOLIDAYS: Readonly<Record<number, readonly string[]>> = {
  2024: [
    '2024-02-09', '2024-02-10', '2024-02-11', '2024-02-12', // 설날 연휴 + 대체 (설날 2/10 토)
    '2024-05-06', // 어린이날 대체 (5/5 일요일)
    '2024-05-15', // 부처님오신날
    '2024-09-16', '2024-09-17', '2024-09-18', // 추석 연휴 (추석 9/17 화)
  ],
  2025: [
    '2025-01-28', '2025-01-29', '2025-01-30', // 설날 연휴 (설날 1/29 수)
    '2025-05-06', // 부처님오신날 대체 (5/5 어린이날과 겹침)
    '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08', // 추석 연휴 + 대체 (추석 10/6 월, 10/5 일 대체)
  ],
  2026: [
    '2026-02-16', '2026-02-17', '2026-02-18', // 설날 연휴 (설날 2/17 화)
    '2026-03-02', // 삼일절 대체 (3/1 일요일)
    '2026-05-24', // 부처님오신날 (일요일)
    '2026-05-25', // 부처님오신날 대체
    '2026-06-08', // 현충일 대체 (6/6 토요일)
    '2026-08-17', // 광복절 대체 (8/15 토요일)
    '2026-09-24', '2026-09-25', '2026-09-26', // 추석 연휴 (추석 9/25 금)
    '2026-09-28', // 추석 대체 (9/26 토요일)
    '2026-10-05', // 개천절 대체 (10/3 토요일)
  ],
  2027: [
    '2027-02-05', '2027-02-06', '2027-02-07', // 설날 연휴 (설날 2/6 토)
    '2027-02-08', '2027-02-09', // 설날 대체 2일 (토/일 겹침)
    '2027-05-13', // 부처님오신날 (목)
    '2027-09-14', '2027-09-15', '2027-09-16', // 추석 연휴 (추석 9/15 수)
    '2027-10-04', // 개천절 대체 (10/3 일요일)
    '2027-10-11', // 한글날 대체 (10/9 토요일)
  ],
  2028: [
    '2028-01-25', '2028-01-26', '2028-01-27', // 설날 연휴 (설날 1/26 수)
    '2028-05-02', // 부처님오신날 (화)
    '2028-10-02', '2028-10-03', '2028-10-04', // 추석 연휴 (추석 10/3 화, 개천절과 겹침)
    '2028-10-05', // 추석/개천절 겹침 대체
  ],
}

function isKoreanHoliday(dateStr: string): boolean {
  const mm = dateStr.slice(5, 7)
  const dd = dateStr.slice(8, 10)
  if (FIXED_HOLIDAYS_MD.has(`${mm}-${dd}`)) return true
  const year = Number(dateStr.slice(0, 4))
  return (VARIABLE_HOLIDAYS[year] ?? []).includes(dateStr)
}

/** YYYY-MM의 n번째 워킹데이 (월~금, 한국 공휴일 제외) */
export function nthWorkingDay(ym: string, n: number): string {
  const [y, m] = parseYM(ym)
  let count = 0
  let lastFound = ''
  const d = new Date(y, m - 1, 1)
  while (d.getMonth() === m - 1) {
    const dow = d.getDay()
    const ds  = fmtDate(d)
    if (dow !== 0 && dow !== 6 && !isKoreanHoliday(ds)) {
      count++
      lastFound = ds
      if (count === n) return ds
    }
    d.setDate(d.getDate() + 1)
  }
  // n이 해당 월의 워킹데이 수보다 크면 마지막 워킹데이 반환
  return lastFound
}
