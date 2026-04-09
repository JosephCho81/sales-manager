'use client'

import React from 'react'
import { fmtKrw } from '@/lib/margin'
import type { InvoiceRow } from './types'

// ── 상수 ──
const TYPE_ORDER = ['sales', 'cost', 'commission', 'other'] as const

const TYPE_LABELS: Record<string, string> = {
  sales: '매출', cost: '원가', commission: '커미션', other: '기타',
}
const TYPE_ROW_BADGE: Record<string, string> = {
  sales: 'bg-blue-100 text-blue-700',
  cost: 'bg-orange-100 text-orange-700',
  commission: 'bg-purple-100 text-purple-700',
  other: 'bg-gray-100 text-gray-600',
}
const TYPE_SECTION_HEADER: Record<string, string> = {
  sales: 'bg-blue-50 text-blue-800 border-blue-200',
  cost: 'bg-orange-50 text-orange-800 border-orange-200',
  commission: 'bg-purple-50 text-purple-800 border-purple-200',
  other: 'bg-gray-50 text-gray-700 border-gray-200',
}

function fmtYearMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월분`
}

// ────────────────────────────────────────────────────────
// InvoiceTable — 타입별 섹션 그룹 테이블
// ────────────────────────────────────────────────────────
export default function InvoiceTable({
  invoices,
  productMap,
  onTogglePaid,
}: {
  invoices: InvoiceRow[]
  productMap: Map<string, string>
  onTogglePaid: (id: string, currentPaid: boolean) => void
}) {
  const totalAmount = invoices.reduce((s, inv) => s + Number(inv.total_amount), 0)

  // 타입별 그룹화
  const byType = new Map<string, InvoiceRow[]>()
  for (const t of TYPE_ORDER) byType.set(t, [])
  for (const inv of invoices) {
    const key = inv.invoice_type ?? 'other'
    const bucket = byType.get(key) ?? byType.get('other')!
    bucket.push(inv)
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th w-20">타입</th>
              <th className="table-th">품목 · 발행회사 → 수취회사</th>
              <th className="table-th text-right">공급가액</th>
              <th className="table-th text-right">VAT</th>
              <th className="table-th text-right">합계</th>
              <th className="table-th whitespace-nowrap">발행기준일</th>
              <th className="table-th whitespace-nowrap">지급예정일</th>
              <th className="table-th text-center w-20">지급완료</th>
            </tr>
          </thead>
          <tbody>
            {TYPE_ORDER.map(typeKey => {
              const rows = byType.get(typeKey) ?? []
              if (rows.length === 0) return null

              const sectionTotal = rows.reduce((s, r) => s + Number(r.total_amount), 0)
              const sectionUnpaid = rows.filter(r => !r.is_paid).reduce((s, r) => s + Number(r.total_amount), 0)

              return (
                <React.Fragment key={typeKey}>
                  {/* 섹션 헤더 */}
                  <tr className={`border-t-2 border-gray-200`}>
                    <td
                      colSpan={6}
                      className={`px-4 py-2 text-xs font-bold uppercase tracking-wide border-b ${TYPE_SECTION_HEADER[typeKey]}`}
                    >
                      {TYPE_LABELS[typeKey]} ({rows.length}건) — 합계 {fmtKrw(sectionTotal)}
                    </td>
                    <td colSpan={2} className={`px-4 py-2 text-xs text-right border-b ${TYPE_SECTION_HEADER[typeKey]}`}>
                      {sectionUnpaid > 0 && (
                        <span className="text-red-500 font-medium">미지급 {fmtKrw(sectionUnpaid)}</span>
                      )}
                    </td>
                  </tr>

                  {/* 행 */}
                  {rows.map(inv => {
                    const productName = inv.product_id ? (productMap.get(inv.product_id) ?? '') : ''
                    const isCommission = typeKey === 'commission'

                    return (
                      <tr
                        key={inv.id}
                        className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${inv.is_paid ? 'opacity-40' : ''}`}
                      >
                        <td className="table-td">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_ROW_BADGE[typeKey]}`}>
                            {TYPE_LABELS[typeKey]}
                          </span>
                        </td>
                        <td className="table-td">
                          {productName && (
                            <p className="text-xs text-gray-400 mb-0.5">{productName}</p>
                          )}
                          <div>
                            <span className="font-medium">{inv.from_company}</span>
                            <span className="text-gray-400 mx-1.5">→</span>
                            <span className="font-medium">{inv.to_company}</span>
                            {isCommission && (
                              <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 text-xs font-semibold border border-purple-100">
                                {fmtYearMonth(inv.year_month)}
                              </span>
                            )}
                          </div>
                          {inv.memo && !isCommission && (
                            <p className="text-xs text-gray-400 mt-0.5 leading-snug">{inv.memo}</p>
                          )}
                        </td>
                        <td className="table-td text-right tabular-nums">
                          {fmtKrw(Number(inv.supply_amount))}
                        </td>
                        <td className="table-td text-right tabular-nums text-gray-500">
                          {Number(inv.vat_amount) > 0
                            ? fmtKrw(Number(inv.vat_amount))
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="table-td text-right tabular-nums font-semibold">
                          {fmtKrw(Number(inv.total_amount))}
                        </td>
                        <td className="table-td text-gray-600 whitespace-nowrap">
                          {inv.invoice_basis_date ?? '—'}
                        </td>
                        <td className="table-td text-gray-600 whitespace-nowrap font-medium">
                          {inv.payment_due_date ?? '—'}
                        </td>
                        <td className="table-td text-center">
                          <input
                            type="checkbox" checked={inv.is_paid}
                            onChange={() => onTogglePaid(inv.id, inv.is_paid)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50">
              <td colSpan={2} className="px-4 py-2 text-sm font-semibold text-gray-700">합계</td>
              <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums">
                {fmtKrw(invoices.reduce((s, inv) => s + Number(inv.supply_amount), 0))}
              </td>
              <td className="px-4 py-2 text-right text-sm text-gray-500 tabular-nums">
                {fmtKrw(invoices.reduce((s, inv) => s + Number(inv.vat_amount), 0))}
              </td>
              <td className="px-4 py-2 text-right text-sm font-bold tabular-nums">{fmtKrw(totalAmount)}</td>
              <td colSpan={2} />
              <td className="px-4 py-2 text-center text-xs text-gray-400">
                {invoices.filter(i => i.is_paid).length}/{invoices.length}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
