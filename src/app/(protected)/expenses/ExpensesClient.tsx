'use client'

import { useMemo, useState } from 'react'
import { useCanEdit } from '@/components/RoleProvider'
import PeriodFilterBar from '@/components/PeriodFilterBar'
import { dateInPeriod, type PeriodFilter } from '@/lib/period'
import { getCurrentYearMonth, getTodayDate, shiftMonths } from '@/lib/date'
import { fmtKrw } from '@/lib/margin'
import { summarizeByMonth } from './expense-settlement'
import ExpenseMonthlySummary from './ExpenseMonthlySummary'
import { useExpenses } from './useExpenses'
import { EXPENSE_PAYERS, EXPENSE_PAYER_LABELS, type Expense, type ExpensePayer } from '@/types'
import ExpenseSettlementCard from './ExpenseSettlementCard'
import ExpenseCard from './ExpenseCard'
import ExpenseTableRow from './ExpenseTableRow'

export default function ExpensesClient({ initialRows }: { initialRows: Expense[] }) {
  const {
    rows, form, setForm,
    saving, error,
    unsettledTotal, settlement, transfers, unassignedTotal, transferMessage,
    detailPayer, setDetailPayer, detailRows,
    editingId, editForm, setEditForm, startEdit, handleUpdate,
    handleSave, handleToggle, handlePayerChange, handleDelete,
  } = useExpenses(initialRows)

  const canEdit = useCanEdit()

  // 조회 기간 — 목록·월별 합계에만 적용. 3사 정산 카드는 기간과 무관하게 미정산 전체 기준
  const [period, setPeriod] = useState<PeriodFilter>(() => {
    const ym = getCurrentYearMonth()
    return { mode: 'all', from: ym, to: ym }
  })
  const visibleRows = useMemo(() => {
    const today = getTodayDate()
    return rows.filter(r => dateInPeriod(r.date, period, today))
  }, [rows, period])
  const months = useMemo(() => summarizeByMonth(visibleRows), [visibleRows])
  const visibleTotal = months.reduce((s, m) => s + m.total, 0)

  const rowProps = (row: Expense) => ({
    row,
    editing: canEdit && editingId === row.id,
    editForm, setEditForm,
    startEdit, handleToggle, handleDelete, handleUpdate, handlePayerChange,
  })

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">비용 정산</h2>
        <p className="text-sm text-gray-500 mt-0.5">공동 비용 입력 및 3사 정산</p>
      </div>

      <ExpenseSettlementCard
        unsettledTotal={unsettledTotal}
        settlement={settlement}
        transfers={transfers}
        unassignedTotal={unassignedTotal}
        transferMessage={transferMessage}
        detailPayer={detailPayer}
        setDetailPayer={setDetailPayer}
        detailRows={detailRows}
      />

      {/* 입력 폼 — 조회 전용 계정에는 숨김 */}
      {canEdit && (
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
      )}

      {/* 기간별 지출 */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-700">지출 내역</h3>
        <PeriodFilterBar
          modes={[{ mode: 'month', label: '월' }, { mode: 'range', label: '기간' }, { mode: 'all', label: '전체' }]}
          value={period}
          onChange={next => setPeriod(p =>
            // 기간 모드로 처음 바꿀 때 시작월을 6개월 전으로 펼쳐 준다
            next.mode === 'range' && p.mode !== 'range' && next.from === next.to
              ? { ...next, from: shiftMonths(next.to, -5) }
              : next
          )}
        />
        <span className="ml-auto text-xs text-gray-500 tabular-nums">
          {visibleRows.length}건 · <b className="text-gray-800">{fmtKrw(visibleTotal)}</b>
        </span>
      </div>
      <ExpenseMonthlySummary months={months} />

      {/* 비용 목록 */}
      {visibleRows.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-gray-400">
          {rows.length === 0 ? '등록된 비용 항목이 없습니다.' : '선택한 기간에 비용 항목이 없습니다.'}
        </div>
      ) : (
        <>
          {/* 모바일 카드 목록 */}
          <div className="sm:hidden flex flex-col gap-2">
            {visibleRows.map(row => <ExpenseCard key={row.id} {...rowProps(row)} />)}
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
                    {canEdit && <th className="table-th text-center whitespace-nowrap">관리</th>}
                    <th className="table-th text-center whitespace-nowrap">지불 업체</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(row => <ExpenseTableRow key={row.id} {...rowProps(row)} />)}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
