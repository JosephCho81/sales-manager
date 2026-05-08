'use client'

import { useExpenses } from './useExpenses'
import { fmtKrw } from '@/lib/margin'
import type { Expense } from '@/types'

export default function ExpensesClient({ initialRows }: { initialRows: Expense[] }) {
  const {
    rows, form, setForm,
    saving, error,
    unsettledTotal, split,
    handleSave, handleToggle, handleDelete,
  } = useExpenses(initialRows)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">비용 정산</h2>
        <p className="text-sm text-gray-500 mt-0.5">공동 비용 입력 및 3사 정산</p>
      </div>

      {/* 미정산 합계 카드 */}
      <div className="card p-4 sm:p-5 mb-6 border-2 border-amber-100 bg-amber-50">
        <p className="text-xs text-gray-500 mb-1">미정산 합계</p>
        <p className="text-2xl font-bold text-amber-700 mb-4">{fmtKrw(unsettledTotal)}</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center text-sm">
          <div className="bg-white rounded-lg p-2 sm:p-3 border border-amber-200">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1 whitespace-nowrap">(주)한국에이원</p>
            <p className="font-semibold text-green-700 tabular-nums text-xs sm:text-sm">{fmtKrw(split.korea_a1)}</p>
          </div>
          <div className="bg-white rounded-lg p-2 sm:p-3 border border-amber-200">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1 whitespace-nowrap">(주)나성</p>
            <p className="font-semibold text-orange-700 tabular-nums text-xs sm:text-sm">{fmtKrw(split.raseong)}</p>
          </div>
          <div className="bg-white rounded-lg p-2 sm:p-3 border border-amber-200">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1 whitespace-nowrap">금화</p>
            <p className="font-semibold text-purple-700 tabular-nums text-xs sm:text-sm">{fmtKrw(split.geumhwa)}</p>
          </div>
        </div>
      </div>

      {/* 입력 폼 */}
      <div className="card p-5 mb-6 border-2 border-blue-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">비용 입력</h3>
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="label">날짜 *</label>
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">내역 *</label>
            <input
              type="text"
              className="input"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="예: 사무용품 구매"
            />
          </div>
          <div>
            <label className="label">금액 (원) *</label>
            <div className="relative">
              <input
                type="number"
                className="input pr-8"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="예: 150000"
                min="0"
                step="1"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원</span>
            </div>
          </div>
          <div>
            <label className="label">비고 (선택)</label>
            <input
              type="text"
              className="input"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="선택 입력"
            />
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? '저장 중…' : '비용 추가'}
        </button>
      </div>

      {/* 비용 목록 */}
      {rows.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-gray-400">등록된 비용 항목이 없습니다.</div>
      ) : (
        <>
          {/* 모바일 카드 목록 */}
          <div className="sm:hidden flex flex-col gap-2">
            {rows.map(row => (
              <div
                key={row.id}
                className={`card p-3 ${row.is_settled ? 'opacity-40' : ''}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs text-gray-500 tabular-nums ${row.is_settled ? 'line-through' : ''}`}>{row.date}</span>
                  {row.is_settled ? (
                    <span className="inline-block px-2 py-0.5 text-xs bg-gray-200 text-gray-500 rounded-full">정산완료</span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">미정산</span>
                  )}
                </div>
                <p className={`text-sm font-medium text-gray-900 mb-1 ${row.is_settled ? 'line-through' : ''}`}>{row.description}</p>
                <p className={`text-sm font-semibold tabular-nums text-gray-800 mb-1 ${row.is_settled ? 'line-through' : ''}`}>{fmtKrw(row.amount)}</p>
                {row.note && <p className="text-xs text-gray-400 mb-2">{row.note}</p>}
                <div className="flex gap-3 border-t border-gray-100 pt-2 mt-1">
                  <button
                    onClick={() => handleToggle(row)}
                    className={`text-xs ${row.is_settled ? 'text-blue-400 hover:text-blue-600' : 'text-green-500 hover:text-green-700'}`}
                  >
                    {row.is_settled ? '미정산으로' : '정산완료'}
                  </button>
                  <button onClick={() => handleDelete(row.id)} className="text-xs text-red-400 hover:text-red-600">
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 데스크톱 테이블 */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-th text-center whitespace-nowrap">날짜</th>
                    <th className="table-th text-center whitespace-nowrap">내역</th>
                    <th className="table-th text-center whitespace-nowrap">금액</th>
                    <th className="table-th text-center whitespace-nowrap">비고</th>
                    <th className="table-th text-center whitespace-nowrap">상태</th>
                    <th className="table-th text-center whitespace-nowrap">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr
                      key={row.id}
                      className={`border-t border-gray-100 ${row.is_settled ? 'opacity-40' : 'hover:bg-gray-50'}`}
                    >
                      <td className="table-td text-center whitespace-nowrap">
                        <span className={row.is_settled ? 'line-through' : ''}>{row.date}</span>
                      </td>
                      <td className="table-td text-center">
                        <span className={row.is_settled ? 'line-through' : ''}>{row.description}</span>
                      </td>
                      <td className="table-td text-center tabular-nums font-semibold whitespace-nowrap">
                        <span className={row.is_settled ? 'line-through' : ''}>{fmtKrw(row.amount)}</span>
                      </td>
                      <td className="table-td text-center text-xs text-gray-400 max-w-xs truncate">{row.note ?? ''}</td>
                      <td className="table-td text-center whitespace-nowrap">
                        {row.is_settled ? (
                          <span className="inline-block px-2 py-0.5 text-xs bg-gray-200 text-gray-500 rounded-full">
                            정산완료
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                            미정산
                          </span>
                        )}
                      </td>
                      <td className="table-td text-center whitespace-nowrap">
                        <button
                          onClick={() => handleToggle(row)}
                          className={`text-xs mr-3 ${
                            row.is_settled
                              ? 'text-blue-400 hover:text-blue-600'
                              : 'text-green-500 hover:text-green-700'
                          }`}
                        >
                          {row.is_settled ? '미정산으로' : '정산완료'}
                        </button>
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
