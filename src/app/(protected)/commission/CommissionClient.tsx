'use client'

import { useState, useMemo } from 'react'
import CommissionSection from './CommissionSection'
import type { CommissionRow } from './types'

export default function CommissionClient({ initialRows }: { initialRows: CommissionRow[] }) {
  const [rows, setRows] = useState<CommissionRow[]>(initialRows)

  const [dongkukRows, hyundaiRows] = useMemo(() => [
    rows.filter(r => r.company === '동국제강').sort((a, b) => b.year_month.localeCompare(a.year_month)),
    rows.filter(r => r.company === '현대제철').sort((a, b) => b.year_month.localeCompare(a.year_month)),
  ], [rows])

  function handleInserted(row: CommissionRow) {
    setRows(prev => [row, ...prev])
  }

  function handleDeleted(id: string) {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">커미션 관리</h2>
        <p className="text-sm text-gray-500 mt-0.5">월 마감 후 화림 통보 커미션 입력 · 1/3 배분</p>
      </div>

      <CommissionSection
        company="동국제강"
        rows={dongkukRows}
        onInserted={handleInserted}
        onDeleted={handleDeleted}
      />

      <div className="border-t border-gray-200 my-2" />

      <CommissionSection
        company="현대제철"
        rows={hyundaiRows}
        onInserted={handleInserted}
        onDeleted={handleDeleted}
      />
    </div>
  )
}
