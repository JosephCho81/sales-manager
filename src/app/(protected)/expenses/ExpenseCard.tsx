'use client'

import { fmtKrw } from '@/lib/margin'
import PayerSelect from './PayerSelect'
import type { ExpenseRowProps } from './expense-row-props'

/** 모바일 비용 카드 (행 클릭 → 인라인 편집) */
export default function ExpenseCard({
  row, editing, editForm, setEditForm,
  startEdit, handleToggle, handleDelete, handleUpdate, handlePayerChange,
}: ExpenseRowProps) {
  return (
    <div
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
          <PayerSelect row={row} onChange={handlePayerChange} />
        </div>
      </div>
    </div>
  )
}
