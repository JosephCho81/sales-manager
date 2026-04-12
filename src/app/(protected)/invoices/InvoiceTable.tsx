'use client'

import React from 'react'
import { fmtKrw } from '@/lib/margin'
import type { InvoiceRow } from '@/lib/invoice-generator'

const TYPE_ORDER = ['sales', 'cost', 'commission', 'other'] as const

const TYPE_LABELS: Record<string, string> = {
  sales: '매출', cost: '매입', commission: '커미션', other: '기타',
}
const TYPE_BADGE: Record<string, string> = {
  sales:      'bg-blue-100 text-blue-700',
  cost:       'bg-orange-100 text-orange-700',
  commission: 'bg-purple-100 text-purple-700',
  other:      'bg-gray-100 text-gray-600',
}

function fmtDeliveryYM(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월분`
}

export default function InvoiceTable({
  invoices,
  productMap,
  onSetPaidDate,
}: {
  invoices: InvoiceRow[]
  productMap: Map<string, string>
  onSetPaidDate: (id: string, date: string | null) => void
}) {
  const totalAmount = invoices.reduce((s, inv) => s + Number(inv.total_amount), 0)

  // 품목별 그룹화 (순서 유지)
  const grouped = new Map<string, InvoiceRow[]>()
  for (const inv of invoices) {
    const key  = inv.product_id ?? '__none__'
    const list = grouped.get(key) ?? []
    list.push(inv)
    grouped.set(key, list)
  }

  // 그룹 내 타입 순서 정렬 (매출→매입→커미션→기타)
  const sortedGroups = Array.from(grouped.entries()).map(([pid, rows]) => ({
    pid,
    rows: [...rows].sort((a, b) => {
      const ai = TYPE_ORDER.indexOf((a.invoice_type ?? 'other') as typeof TYPE_ORDER[number])
      const bi = TYPE_ORDER.indexOf((b.invoice_type ?? 'other') as typeof TYPE_ORDER[number])
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    }),
  }))

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {sortedGroups.map(({ pid, rows }) => {
              const displayName = pid === '__none__' ? '기타' : (productMap.get(pid) ?? pid)
              const groupTotal  = rows.reduce((s, r) => s + Number(r.total_amount), 0)
              const groupUnpaid = rows.filter(r => !r.paid_at).reduce((s, r) => s + Number(r.total_amount), 0)

              return (
                <React.Fragment key={pid}>
                  {/* 품목 헤더 */}
                  <tr className="border-t-2 border-gray-300 bg-gray-100">
                    <td colSpan={6} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">{displayName}</span>
                        {rows[0]?.delivery_year_month && (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                            {fmtDeliveryYM(rows[0].delivery_year_month)}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 ml-1">합계 {fmtKrw(groupTotal)}</span>
                      </div>
                    </td>
                    <td colSpan={2} className="px-4 py-2 text-right">
                      {groupUnpaid > 0 && (
                        <span className="text-xs text-red-500 font-medium">미지급 {fmtKrw(groupUnpaid)}</span>
                      )}
                    </td>
                  </tr>

                  {/* 컬럼 헤더 */}
                  <tr className="bg-gray-50 text-xs text-gray-500 border-t border-gray-200">
                    <th className="px-4 py-1.5 text-center font-medium w-20">구분</th>
                    <th className="px-4 py-1.5 text-center font-medium">발행회사 → 수취회사</th>
                    <th className="px-4 py-1.5 text-center font-medium">공급가액</th>
                    <th className="px-4 py-1.5 text-center font-medium">VAT</th>
                    <th className="px-4 py-1.5 text-center font-medium">합계</th>
                    <th className="px-4 py-1.5 text-center font-medium whitespace-nowrap">발행기준일</th>
                    <th className="px-4 py-1.5 text-center font-medium whitespace-nowrap">지급예정일</th>
                    <th className="px-4 py-1.5 text-center font-medium whitespace-nowrap">지급완료일</th>
                  </tr>

                  {/* 계산서 행 */}
                  {rows.map(inv => {
                    const typeKey = inv.invoice_type ?? 'other'
                    return (
                      <tr
                        key={inv.id}
                        className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${inv.paid_at ? 'opacity-40' : ''}`}
                      >
                        <td className="table-td">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_BADGE[typeKey] ?? TYPE_BADGE.other}`}>
                            {TYPE_LABELS[typeKey] ?? typeKey}
                          </span>
                        </td>
                        <td className="table-td">
                          <div>
                            <span className="font-medium">{inv.from_company}</span>
                            <span className="text-gray-400 mx-1.5">→</span>
                            <span className="font-medium">{inv.to_company}</span>
                          </div>
                          {inv.memo && (
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
                            type="date"
                            value={inv.paid_at ? inv.paid_at.slice(0, 10) : ''}
                            onChange={e => onSetPaidDate(inv.id, e.target.value || null)}
                            className="border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                {invoices.filter(i => i.paid_at).length}/{invoices.length} 지급
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
