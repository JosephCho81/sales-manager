'use client'

import { fmtKrw } from '@/lib/margin'
import { EXPENSE_PAYERS, EXPENSE_PAYER_LABELS } from '@/types'
import type { ExpenseMonthRow } from './expense-settlement'

/** 기간 내 월별 지출 — 정산 카드(미정산 전체 기준)와 달리 선택 기간의 실제 지출을 본다 */
export default function ExpenseMonthlySummary({ months }: { months: ExpenseMonthRow[] }) {
  if (months.length === 0) return null
  const showUnassigned = months.some(m => m.unassigned !== 0)
  const sum = (f: (m: ExpenseMonthRow) => number) => months.reduce((s, m) => s + f(m), 0)

  return (
    <div className="card mb-4 overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr>
            <th className="table-th text-center whitespace-nowrap">월</th>
            {EXPENSE_PAYERS.map(p => (
              <th key={p} className="table-th text-right whitespace-nowrap">{EXPENSE_PAYER_LABELS[p]}</th>
            ))}
            {showUnassigned && <th className="table-th text-right whitespace-nowrap">미지정</th>}
            <th className="table-th text-right whitespace-nowrap">합계</th>
            <th className="table-th text-right whitespace-nowrap">건수</th>
          </tr>
        </thead>
        <tbody>
          {months.map(m => (
            <tr key={m.ym} className="border-t border-gray-100">
              <td className="table-td text-center font-mono text-xs">{m.ym}</td>
              {EXPENSE_PAYERS.map(p => (
                <td key={p} className="table-td text-right text-gray-600">{m.byPayer[p] ? fmtKrw(m.byPayer[p]) : '—'}</td>
              ))}
              {showUnassigned && <td className="table-td text-right text-gray-400">{m.unassigned ? fmtKrw(m.unassigned) : '—'}</td>}
              <td className="table-td text-right font-semibold">{fmtKrw(m.total)}</td>
              <td className="table-td text-right text-gray-500">{m.count}</td>
            </tr>
          ))}
        </tbody>
        {months.length > 1 && (
          <tfoot>
            <tr className="border-t-2 border-gray-200 font-bold">
              <td className="table-td text-center">합계</td>
              {EXPENSE_PAYERS.map(p => (
                <td key={p} className="table-td text-right">{fmtKrw(sum(m => m.byPayer[p]))}</td>
              ))}
              {showUnassigned && <td className="table-td text-right">{fmtKrw(sum(m => m.unassigned))}</td>}
              <td className="table-td text-right text-blue-700">{fmtKrw(sum(m => m.total))}</td>
              <td className="table-td text-right">{sum(m => m.count)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
