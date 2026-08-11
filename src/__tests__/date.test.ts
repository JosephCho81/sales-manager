import { describe, it, expect } from 'vitest'
import {
  workingDayOnOrAfter,
  workingDayOnOrBefore,
  workingDayFrom,
  setVariableHolidays,
  isHolidayYearCovered,
  coveredHolidayYears,
} from '@/lib/date'

// 이 파일은 setVariableHolidays로 모듈 전역 표를 바꾼다.
// vitest는 파일마다 모듈을 격리하므로 다른 테스트에 새지 않는다.

describe('워킹데이 보정 — 방향', () => {
  it('onOrAfter: 휴일이면 다음 영업일 (설연휴 2024-02-10 토 → 02-13 화)', () => {
    expect(workingDayOnOrAfter('2024-02', 10)).toBe('2024-02-13')
  })

  it('onOrBefore: 휴일이면 직전 영업일 (2024-02-10 → 02-08 목)', () => {
    expect(workingDayOnOrBefore('2024-02', 10)).toBe('2024-02-08')
  })

  it('영업일이면 양쪽 다 그대로 (2024-05-10 금)', () => {
    expect(workingDayOnOrAfter('2024-05', 10)).toBe('2024-05-10')
    expect(workingDayOnOrBefore('2024-05', 10)).toBe('2024-05-10')
  })

  it('고정 공휴일도 보정 대상 (2024-01-01 신정 월 → 01-02)', () => {
    expect(workingDayFrom('2024-01-01')).toBe('2024-01-02')
  })
})

describe('공휴일 표 교체 (DB 연동)', () => {
  it('기본값은 코드 시드 — 2024~2028 등록됨', () => {
    expect(isHolidayYearCovered(2024)).toBe(true)
    expect(isHolidayYearCovered(2028)).toBe(true)
  })

  it('시드에 없는 연도는 미등록 — 조용히 틀리는 대신 감지된다', () => {
    expect(isHolidayYearCovered(2029)).toBe(false)
  })

  it('setVariableHolidays가 계산 결과를 실제로 바꾼다', () => {
    // 2029-02-12(월)을 공휴일로 등록하면 12일 지급이 09일(금)로 앞당겨져야 한다
    expect(workingDayOnOrBefore('2029-02', 12)).toBe('2029-02-12')

    setVariableHolidays({ 2029: ['2029-02-12'] })

    expect(isHolidayYearCovered(2029)).toBe(true)
    expect(coveredHolidayYears()).toEqual([2029])
    expect(workingDayOnOrBefore('2029-02', 12)).toBe('2029-02-09')
    expect(workingDayOnOrAfter('2029-02', 12)).toBe('2029-02-13')

    // 표를 통째로 교체하므로 이전 연도는 더 이상 등록 상태가 아니다
    expect(isHolidayYearCovered(2024)).toBe(false)
  })
})
