'use client'

import { fmtKrw } from '@/lib/margin'
import PayerSelect from './PayerSelect'
import type { ExpenseRowProps } from './expense-row-props'

/** 데스크톱 비용 테이블 행 (행 클릭 → 인라인 편집) */
export default function ExpenseTableRow({
  row, editing, editForm, setEditForm,
  startEdit, handleToggle, handleDelete, handleUpdate, handlePayerChange,
}: ExpenseRowProps) {
  return (
    <tr
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
        <PayerSelect row={row} onChange={handlePayerChange} />
      </td>
    </tr>
  )
}
