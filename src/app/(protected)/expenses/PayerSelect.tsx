'use client'

import { EXPENSE_PAYERS, EXPENSE_PAYER_LABELS, type Expense, type ExpensePayer } from '@/types'

/** 비용 행의 지불 업체 선택 — 정산완료 행은 비활성 */
export default function PayerSelect({
  row,
  onChange,
}: {
  row: Expense
  onChange: (row: Expense, payer: ExpensePayer | null) => void
}) {
  return (
    <select
      className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700"
      value={row.payer ?? ''}
      disabled={row.is_settled}
      onClick={e => e.stopPropagation()}
      onChange={e => onChange(row, (e.target.value || null) as ExpensePayer | null)}
    >
      <option value="">미지정</option>
      {EXPENSE_PAYERS.map(p => (
        <option key={p} value={p}>{EXPENSE_PAYER_LABELS[p]}</option>
      ))}
    </select>
  )
}
