import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { setVariableHolidays, isHolidayYearCovered } from '@/lib/date'

export type HolidayRow = { date: string; name: string }

/** `holidays` 테이블 전체 (오름차순) */
export async function fetchHolidays(): Promise<HolidayRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('holidays').select('date, name').order('date')
  if (error) throw new Error(`공휴일 조회 실패: ${error.message}`)
  return (data ?? []) as HolidayRow[]
}

/**
 * DB의 공휴일을 date.ts 전역 표에 반영한다.
 * **지급일이 계산되는 모든 경로(계산서 생성·미리보기)에서 계산 직전에 호출할 것.**
 * 호출하지 않으면 코드 시드(마지막 등록 연도까지)로 계산돼 조용히 틀릴 수 있다.
 *
 * 테이블이 비어 있으면(=018 미적용) 코드 시드를 유지한다 — 마이그레이션 전에
 * 전 연도가 "미등록"으로 바뀌어 멀쩡한 계산까지 경고가 뜨는 걸 막는다.
 */
export async function hydrateHolidays(): Promise<void> {
  const rows = await fetchHolidays()
  if (rows.length === 0) return

  const byYear: Record<number, string[]> = {}
  for (const r of rows) {
    const year = Number(r.date.slice(0, 4))
    ;(byYear[year] ??= []).push(r.date)
  }
  setVariableHolidays(byYear)
}

/**
 * yearMonth 기준으로 계산서가 건드리는 연도들이 모두 등록돼 있는지 검사.
 * 지급일은 익익월(+말일 보정)까지 밀릴 수 있어 다음 해로 넘어갈 수 있다 —
 * 그래서 해당 월과 3개월 뒤까지 확인한다.
 */
export function uncoveredHolidayYears(yearMonth: string): number[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const years = new Set<number>()
  for (let i = 0; i <= 3; i++) years.add(new Date(y, m - 1 + i, 1).getFullYear())
  return [...years].filter(year => !isHolidayYearCovered(year)).sort()
}
