'use client'

import { useExpenses } from './useExpenses'
import { fmtKrw } from '@/lib/margin'
import { EXPENSE_PAYERS, EXPENSE_PAYER_LABELS, type Expense, type ExpensePayer } from '@/types'

const PAYER_FULL_LABELS: Record<ExpensePayer, string> = {
  korea_a1: '(주)한국에이원',
  raseong: '(주)나성',
  geumhwa: '금화',
}

export default function ExpensesClient({ initialRows }: { initialRows: Expense[] }) {
  const {
    rows, form, setForm,
    saving, error,
    unsettledTotal, settlement, transfers, unassignedTotal,
    detailPayer, setDetailPayer, detailRows,
    editingId, editForm, setEditForm, startEdit, handleUpdate,
    handleSave, handleToggle, handlePayerChange, handleDelete,
  } = useExpenses(initialRows)

  const detailTotal = detailRows.reduce((s, r) => s + r.amount, 0)

  function renderPayerSelect(row: Expense) {
    return (
      <select
        className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700"
        value={row.payer ?? ''}
        disabled={row.is_settled}
        onClick={e => e.stopPropagation()}
        onChange={e => handlePayerChange(row, (e.target.value || null) as ExpensePayer | null)}
      >
        <option value="">미지정</option>
        {EXPENSE_PAYERS.map(p => (
          <option key={p} value={p}>{EXPENSE_PAYER_LABELS[p]}</option>
        ))}
      </select>
    )
  }

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
          {EXPENSE_PAYERS.map(p => {
            const s = settlement[p]
            const selected = detailPayer === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => setDetailPayer(prev => (prev === p ? null : p))}
                className={`bg-white rounded-lg p-2 sm:p-3 border text-center transition-colors ${
                  selected ? 'border-amber-500 ring-1 ring-amber-400' : 'border-amber-200 hover:border-amber-400'
                }`}
              >
                <p className="text-[10px] sm:text-xs text-gray-500 mb-1 whitespace-nowrap">{PAYER_FULL_LABELS[p]}</p>
                {s.net > 0 ? (
                  <p className="font-semibold text-red-600 tabular-nums text-xs sm:text-sm whitespace-nowrap">낼 금액 {fmtKrw(s.net)}</p>
                ) : s.net < 0 ? (
                  <p className="font-semibold text-blue-600 tabular-nums text-xs sm:text-sm whitespace-nowrap">받을 금액 {fmtKrw(-s.net)}</p>
                ) : (
                  <p className="font-semibold text-gray-500 tabular-nums text-xs sm:text-sm">0원</p>
                )}
                <p className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">
                  1/3 부담 {fmtKrw(s.share)} · 지불 {fmtKrw(s.paid)}
                </p>
              </button>
            )
          })}
        </div>

        {/* 업체 간 송금 안내 */}
        {(transfers.length > 0 || unassignedTotal > 0) && (
          <div className="mt-3 bg-white rounded-lg border border-amber-200 p-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">정산 송금</p>
            {transfers.length === 0 ? (
              <p className="text-xs text-gray-400 py-1 text-center">업체 간 송금할 내역이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {transfers.map((t, idx) => (
                  <li key={idx} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-gray-700">
                      <span className="font-medium text-red-600">{PAYER_FULL_LABELS[t.from]}</span>
                      <span className="mx-1.5 text-gray-400">→</span>
                      <span className="font-medium text-blue-600">{PAYER_FULL_LABELS[t.to]}</span>
                    </span>
                    <span className="font-semibold tabular-nums text-gray-800">{fmtKrw(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {unassignedTotal > 0 && (
              <p className="text-[11px] text-amber-600 mt-2 pt-2 border-t border-gray-100">
                지불 업체 미지정 {fmtKrw(unassignedTotal)}은 송금 계산에서 제외됩니다. 목록에서 지불 업체를 지정해 주세요.
              </p>
            )}
          </div>
        )}

        {/* 업체별 지불 세부 내역 */}
        {detailPayer && (
          <div className="mt-3 bg-white rounded-lg border border-amber-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700">
                {PAYER_FULL_LABELS[detailPayer]} 지불 내역 (미정산)
              </p>
              <button
                type="button"
                onClick={() => setDetailPayer(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                닫기
              </button>
            </div>
            {detailRows.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">지불한 내역이 없습니다.</p>
            ) : (
              <>
                <ul className="divide-y divide-gray-100">
                  {detailRows.map(r => (
                    <li key={r.id} className="flex items-center justify-between py-1.5 text-xs">
                      <span className="text-gray-400 tabular-nums shrink-0 mr-3">{r.date}</span>
                      <span className="text-gray-700 flex-1 truncate text-left">{r.description}</span>
                      <span className="font-semibold tabular-nums text-gray-800 ml-3 shrink-0">{fmtKrw(r.amount)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-200 text-xs">
                  <span className="font-semibold text-gray-600">합계</span>
                  <span className="font-bold tabular-nums text-gray-900">{fmtKrw(detailTotal)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 입력 폼 */}
      <div className="card p-5 mb-6 border-2 border-blue-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">비용 입력</h3>
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
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
            <label className="label">지불 업체 *</label>
            <select
              className="input"
              value={form.payer}
              onChange={e => setForm(f => ({ ...f, payer: e.target.value as '' | ExpensePayer }))}
            >
              <option value="">선택</option>
              {EXPENSE_PAYERS.map(p => (
                <option key={p} value={p}>{EXPENSE_PAYER_LABELS[p]}</option>
              ))}
            </select>
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
            {rows.map(row => {
              const editing = editingId === row.id
              return (
                <div
                  key={row.id}
                  onClick={() => startEdit(row)}
                  className={`card p-3 ${row.is_settled ? 'opacity-40' : ''} ${editing ? 'ring-1 ring-blue-300 bg-blue-50' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    {editing ? (
                      <input
                        type="date"
                        className="input text-xs py-1 w-32"
                        value={editForm.date}
                        onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                      />
                    ) : (
                      <span className={`text-xs text-gray-500 tabular-nums ${row.is_settled ? 'line-through' : ''}`}>{row.date}</span>
                    )}
                    {row.is_settled ? (
                      <span className="inline-block px-2 py-0.5 text-xs bg-gray-200 text-gray-500 rounded-full whitespace-nowrap">정산완료</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full whitespace-nowrap">미정산</span>
                    )}
                  </div>
                  {editing ? (
                    <>
                      <input
                        type="text"
                        className="input text-xs py-1 w-full mb-1"
                        value={editForm.description}
                        onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="내역"
                      />
                      <input
                        type="number"
                        className="input text-xs py-1 w-full mb-1"
                        value={editForm.amount}
                        onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                        min="0"
                        step="1"
                        placeholder="금액 (원)"
                      />
                      <input
                        type="text"
                        className="input text-xs py-1 w-full mb-1"
                        value={editForm.note}
                        onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                        placeholder="비고 (선택)"
                      />
                    </>
                  ) : (
                    <>
                      <p className={`text-sm font-medium text-gray-900 mb-1 ${row.is_settled ? 'line-through' : ''}`}>{row.description}</p>
                      <p className={`text-sm font-semibold tabular-nums text-gray-800 mb-1 ${row.is_settled ? 'line-through' : ''}`}>{fmtKrw(row.amount)}</p>
                      {row.note && <p className="text-xs text-gray-400 mb-2">{row.note}</p>}
                    </>
                  )}
                  <div className="flex items-center gap-3 border-t border-gray-100 pt-2 mt-1">
                    <button
                      onClick={e => { e.stopPropagation(); handleToggle(row) }}
                      className={`text-xs whitespace-nowrap ${row.is_settled ? 'text-blue-400 hover:text-blue-600' : 'text-green-500 hover:text-green-700'}`}
                    >
                      {row.is_settled ? '미정산으로' : '정산완료'}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(row.id) }}
                      className="text-xs whitespace-nowrap text-red-400 hover:text-red-600"
                    >
                      삭제
                    </button>
                    {editing && (
                      <button
                        onClick={e => { e.stopPropagation(); handleUpdate() }}
                        className="text-xs whitespace-nowrap font-semibold text-blue-600 hover:text-blue-800"
                      >
                        수정완료
                      </button>
                    )}
                    <div className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
                      <span className="text-[10px] text-gray-400">지불</span>
                      {renderPayerSelect(row)}
                    </div>
                  </div>
                </div>
              )
            })}
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
                    <th className="table-th text-center whitespace-nowrap">지불 업체</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const editing = editingId === row.id
                    return (
                      <tr
                        key={row.id}
                        onClick={() => startEdit(row)}
                        className={`border-t border-gray-100 ${row.is_settled ? 'opacity-40' : 'hover:bg-gray-50 cursor-pointer'} ${editing ? 'bg-blue-50' : ''}`}
                      >
                        <td className="table-td text-center whitespace-nowrap">
                          {editing ? (
                            <input
                              type="date"
                              className="input text-xs py-1 w-32"
                              value={editForm.date}
                              onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                            />
                          ) : (
                            <span className={row.is_settled ? 'line-through' : ''}>{row.date}</span>
                          )}
                        </td>
                        <td className="table-td text-center">
                          {editing ? (
                            <input
                              type="text"
                              className="input text-xs py-1 min-w-[8rem]"
                              value={editForm.description}
                              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                            />
                          ) : (
                            <span className={row.is_settled ? 'line-through' : ''}>{row.description}</span>
                          )}
                        </td>
                        <td className="table-td text-center tabular-nums font-semibold whitespace-nowrap">
                          {editing ? (
                            <input
                              type="number"
                              className="input text-xs py-1 w-28"
                              value={editForm.amount}
                              onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                              min="0"
                              step="1"
                            />
                          ) : (
                            <span className={row.is_settled ? 'line-through' : ''}>{fmtKrw(row.amount)}</span>
                          )}
                        </td>
                        <td className="table-td text-center text-xs text-gray-400 max-w-xs truncate">
                          {editing ? (
                            <input
                              type="text"
                              className="input text-xs py-1 min-w-[6rem]"
                              value={editForm.note}
                              onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                              placeholder="비고"
                            />
                          ) : (
                            row.note ?? ''
                          )}
                        </td>
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
                            onClick={e => { e.stopPropagation(); handleToggle(row) }}
                            className={`text-xs mr-3 ${
                              row.is_settled
                                ? 'text-blue-400 hover:text-blue-600'
                                : 'text-green-500 hover:text-green-700'
                            }`}
                          >
                            {row.is_settled ? '미정산으로' : '정산완료'}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete(row.id) }}
                            className={`text-xs text-red-400 hover:text-red-600${editing ? ' mr-3' : ''}`}
                          >
                            삭제
                          </button>
                          {editing && (
                            <button
                              onClick={e => { e.stopPropagation(); handleUpdate() }}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                            >
                              수정완료
                            </button>
                          )}
                        </td>
                        <td className="table-td text-center whitespace-nowrap">
                          {renderPayerSelect(row)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
