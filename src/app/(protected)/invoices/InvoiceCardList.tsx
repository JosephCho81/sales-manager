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

function commGroupOrder(rows: InvoiceRow[]): number {
  const memo = rows.find(r => r.to_company === '(주)한국에이원')?.memo ?? ''
  if (memo.includes('동국제강')) return 900
  if (memo.includes('현대제철')) return 901
  return 950
}

function commGroupLabel(rows: InvoiceRow[]): string {
  const receipt = rows.find(r => r.to_company === '(주)한국에이원')
  const memo = receipt?.memo ?? ''
  if (memo.includes('동국제강')) return '동국제강 커미션'
  if (memo.includes('현대제철')) return '현대제철 커미션'
  return receipt?.from_company ? `${receipt.from_company} 커미션` : '커미션'
}

export default function InvoiceCardList({
  invoices,
  productMap,
  productOrderMap,
}: {
  invoices: InvoiceRow[]
  productMap: Map<string, string>
  productOrderMap: Map<string, number>
}) {
  const grouped = new Map<string, InvoiceRow[]>()
  for (const inv of invoices) {
    const key = inv.product_id
      ?? (inv.delivery_ids?.[0] ? `__comm_${inv.delivery_ids[0]}` : '__none__')
    const list = grouped.get(key) ?? []
    list.push(inv)
    grouped.set(key, list)
  }

  const sortedGroups = Array.from(grouped.entries()).map(([pid, rows]) => ({
    pid,
    order: pid.startsWith('__comm_') ? commGroupOrder(rows)
         : pid === '__none__'        ? 999
         : (productOrderMap.get(pid) ?? 998),
    rows: [...rows].sort((a, b) => {
      const ai = TYPE_ORDER.indexOf((a.invoice_type ?? 'other') as typeof TYPE_ORDER[number])
      const bi = TYPE_ORDER.indexOf((b.invoice_type ?? 'other') as typeof TYPE_ORDER[number])
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    }),
  })).sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-3 md:hidden">
      {sortedGroups.map(({ pid, rows }) => {
        const isComm     = pid.startsWith('__comm_')
        const displayName = isComm          ? commGroupLabel(rows)
                          : pid === '__none__' ? '기타'
                          : (productMap.get(pid) ?? pid)
        const groupUnpaid = rows
          .filter(r => !r.paid_at)
          .reduce((s, r) => s + Number(r.total_amount), 0)

        return (
          <div key={pid} className="rounded-lg overflow-hidden border border-gray-200">
            {/* 그룹 헤더 */}
            <div className={`flex items-center gap-2 px-3 py-2 border-l-4 ${
              isComm
                ? 'bg-amber-50 border-amber-400'
                : 'bg-gray-100 border-gray-400'
            }`}>
              <span className={`text-sm font-bold ${isComm ? 'text-amber-800' : 'text-gray-800'}`}>
                {displayName}
              </span>
              {rows[0]?.delivery_year_month && (
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                  {fmtDeliveryYM(rows[0].delivery_year_month)}
                </span>
              )}
              {groupUnpaid > 0 && (
                <span className="ml-auto text-xs text-red-500 font-semibold whitespace-nowrap">
                  미지급 {fmtKrw(groupUnpaid)}
                </span>
              )}
            </div>

            {/* 카드 목록 */}
            {rows.map((inv, idx) => {
              const typeKey = inv.invoice_type ?? 'other'
              const hasVat  = Number(inv.vat_amount) > 0
              return (
                <div
                  key={inv.id}
                  className={`px-3 py-2.5 bg-white ${idx > 0 ? 'border-t border-gray-100' : ''} ${inv.paid_at ? 'opacity-40' : ''}`}
                >
                  {/* 배지 + 회사 */}
                  <div className="flex items-start gap-2 mb-2">
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_BADGE[typeKey] ?? TYPE_BADGE.other}`}>
                      {TYPE_LABELS[typeKey] ?? typeKey}
                    </span>
                    <span className="text-sm text-gray-700 leading-snug">
                      <span className="font-medium">{inv.from_company}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span className="font-medium">{inv.to_company}</span>
                    </span>
                  </div>

                  {/* 메모 */}
                  {inv.memo && (
                    <p className="text-xs text-gray-400 mb-2 pl-0.5">{inv.memo}</p>
                  )}

                  {/* 금액 + 지급예정일 */}
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs text-gray-400 tabular-nums">
                        공급 {fmtKrw(Number(inv.supply_amount))}
                        {hasVat && <span className="ml-2">VAT {fmtKrw(Number(inv.vat_amount))}</span>}
                      </p>
                      <p className="text-sm font-bold text-gray-900 mt-0.5 tabular-nums">
                        합계 {fmtKrw(Number(inv.total_amount))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">지급예정일</p>
                      <p className="text-sm font-semibold text-gray-700">
                        {inv.payment_due_date ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
