'use client'

import { useExpenses } from './useExpenses'
import { EXPENSE_PAYERS, EXPENSE_PAYER_LABELS, type Expense, type ExpensePayer } from '@/types'
import ExpenseSettlementCard from './ExpenseSettlementCard'
import ExpenseCard from './ExpenseCard'
import ExpenseTableRow from './ExpenseTableRow'

export default function ExpensesClient({ initialRows }: { initialRows: Expense[] }) {
  const {
    rows, form, setForm,
    saving, error,
    unsettledTotal, settlement, transfers, unassignedTotal,
    detailPayer, setDetailPayer, detailRows,
    editingId, editForm, setEditForm, startEdit, handleUpdate,
    handleSave, handleToggle, handlePayerChange, handleDelete,
  } = useExpenses(initialRows)

  const rowProps = (row: Expense) => ({
    row,
    editing: editingId === row.id,
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
        detailPayer={detailPayer}
        setDetailPayer={setDetailPayer}
        detailRows={detailRows}
      />

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
            {rows.map(row => <ExpenseCard key={row.id} {...rowProps(row)} />)}
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
                  {rows.map(row => <ExpenseTableRow key={row.id} {...rowProps(row)} />)}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
