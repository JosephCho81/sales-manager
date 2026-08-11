'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCanEdit } from '@/components/RoleProvider'
import { addHoliday, deleteHoliday } from './holiday-actions'
import type { HolidayRow } from '@/lib/holidays'

/**
 * 공휴일 관리 — 지급일의 휴일 보정 기준.
 * 신정·삼일절처럼 매년 같은 날은 코드에 있고 여기 나오지 않는다.
 * 여기 넣는 건 해마다 날짜가 바뀌는 설·추석·부처님오신날·대체공휴일이다.
 */
export default function HolidayPanel({
  holidays,
  uncoveredYears,
}: {
  holidays: HolidayRow[]
  /** 향후 몇 년 중 등록이 비어 있는 연도 */
  uncoveredYears: number[]
}) {
  const router = useRouter()
  const canEdit = useCanEdit()
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openYear, setOpenYear] = useState<number | null>(new Date().getFullYear())

  const byYear = new Map<number, HolidayRow[]>()
  for (const h of holidays) {
    const y = Number(h.date.slice(0, 4))
    byYear.set(y, [...(byYear.get(y) ?? []), h])
  }
  const years = [...byYear.keys()].sort((a, b) => b - a)

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true)
    setError(null)
    const res = await fn()
    setBusy(false)
    if (res.error) { setError(res.error); return }
    router.refresh()
  }

  return (
    <div className="card p-5 mt-8">
      <h3 className="text-base font-bold text-gray-800">공휴일 관리</h3>
      <p className="text-xs text-gray-500 mt-1">
        지급일이 토·일·공휴일이면 앞뒤 영업일로 보정합니다. 매년 같은 날(신정·삼일절·어린이날·현충일·광복절·개천절·한글날·성탄절)은
        자동 처리되므로, 여기에는 <b>설·추석·부처님오신날·대체공휴일</b>만 등록하면 됩니다.
      </p>

      {uncoveredYears.length > 0 && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-sm font-bold text-amber-800">{uncoveredYears.join('·')}년 미등록</p>
          <p className="text-xs text-amber-700 mt-0.5">
            해당 연도 지급일의 휴일 보정이 틀릴 수 있습니다. 등록 후 지급 일정 화면에서 재생성하세요.
          </p>
        </div>
      )}

      {canEdit && (
        <div className="flex items-end gap-2 mt-4 flex-wrap">
          <div>
            <label className="block text-xs text-gray-400 mb-1">날짜</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-xs text-gray-400 mb-1">이름</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="예: 추석 연휴"
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full" />
          </div>
          <button
            disabled={busy || !date || !name}
            className="btn-primary text-xs disabled:opacity-40"
            onClick={() => run(async () => {
              const res = await addHoliday(date, name)
              if (!res.error) { setDate(''); setName('') }
              return res
            })}
          >
            {busy ? '저장 중…' : '공휴일 추가'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

      {years.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">등록된 공휴일이 없습니다. (마이그레이션 018 미적용 시 코드 기본값으로 계산됩니다)</p>
      ) : (
        <div className="mt-4 space-y-1">
          {years.map(y => (
            <div key={y} className="border border-gray-100 rounded">
              <button
                onClick={() => setOpenYear(openYear === y ? null : y)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
              >
                <span className="font-medium text-gray-700">{y}년</span>
                <span className="text-xs text-gray-400">{byYear.get(y)!.length}일 {openYear === y ? '▴' : '▾'}</span>
              </button>
              {openYear === y && (
                <ul className="border-t border-gray-100 divide-y divide-gray-50">
                  {byYear.get(y)!.map(h => (
                    <li key={h.date} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span className="tabular-nums text-gray-700">{h.date}</span>
                      <span className="flex-1 px-3 text-xs text-gray-400 truncate">{h.name}</span>
                      {canEdit && (
                        <button
                          disabled={busy}
                          className="text-xs text-red-400 hover:text-red-600"
                          onClick={() => {
                            if (confirm(`${h.date} (${h.name})을(를) 삭제할까요?`)) {
                              run(() => deleteHoliday(h.date))
                            }
                          }}
                        >삭제</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
