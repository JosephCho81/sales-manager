'use client'

import React from 'react'
import { fmtKrw } from '@/lib/margin'
import { depBadgeFor, depBreakdownFor, type DepBreakdown } from '@/lib/depreciation'
import type { MonthlyDepreciation } from '@/types'
import type { InvoiceRow } from '@/lib/invoice-generator'

const TYPE_ORDER = ['sales', 'cost', 'commission', 'other'] as const

export const BADGE_TONE: Record<string, string> = {
  shortfall: 'bg-red-50 text-red-700 border-red-200',
  applied:   'bg-blue-50 text-blue-700 border-blue-200',
  pending:   'bg-gray-100 text-gray-600 border-gray-300',
  hold:      'bg-amber-50 text-amber-700 border-amber-200',
}

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

/**
 * 감가가 반영된 행의 산식을 그대로 노출.
 * 순액만 보이면 담당자가 왜 줄었는지 알 수 없어 거래처 대사를 못 한다.
 */
export function DepBreakdownNote({ bd }: { bd: DepBreakdown }) {
  const origin = bd.originYMs.map(y => `${parseInt(y.slice(5, 7))}월`).join('·')
  return (
    <div className="mt-1 inline-block rounded border border-dashed border-gray-300 bg-gray-50 px-2 py-1 text-xs leading-snug text-gray-600 tabular-nums">
      <div>
        감가 반영 전 <span className="font-medium">{fmtKrw(bd.grossTotal)}</span>
        <span className="text-gray-400"> (공급가 {fmtKrw(bd.grossSupply)} + VAT {fmtKrw(bd.grossVat)})</span>
      </div>
      <div className="text-red-600">
        − {origin}분 감가 {fmtKrw(bd.depTotal)}
        <span className="opacity-70"> (공급가 {fmtKrw(bd.depSupply)} + VAT {fmtKrw(bd.depVat)})</span>
      </div>
      <div className="mt-0.5 border-t border-gray-200 pt-0.5 font-medium text-gray-800">
        = 계산서 {fmtKrw(bd.netTotal)}
      </div>
    </div>
  )
}

export default function InvoiceTable({
  invoices,
  productMap,
  productOrderMap,
  deps,
  onSetPaidDate,
  onOpenPayment,
}: {
  invoices: InvoiceRow[]
  productMap: Map<string, string>
  productOrderMap: Map<string, number>
  deps: MonthlyDepreciation[]
  onSetPaidDate: (id: string, date: string | null) => void
  onOpenPayment: (inv: InvoiceRow) => void
}) {
  // 품목별 그룹화
  // null product_id인 커미션은 delivery_ids[0](커미션 row ID)로 개별 그룹화
  const grouped = new Map<string, InvoiceRow[]>()
  for (const inv of invoices) {
    const key = inv.product_id
      ?? (inv.delivery_ids?.[0] ? `__comm_${inv.delivery_ids[0]}` : '__none__')
    const list = grouped.get(key) ?? []
    list.push(inv)
    grouped.set(key, list)
  }

  // 커미션 그룹 순서: 수취 invoice의 memo로 회사 구분 (from_company는 항상 '화림')
  function commGroupOrder(rows: InvoiceRow[]): number {
    const receipt = rows.find(r => r.to_company === '(주)한국에이원')
    const memo = receipt?.memo ?? ''
    if (memo.includes('동국제강')) return 900
    if (memo.includes('현대제철')) return 901
    return 950
  }

  // 그룹 정렬: 품목 순서(0~7) → 커미션(900+) → 기타(999)
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

  // 커미션 그룹 헤더 라벨 derivation (memo에서 회사명 추출)
  function commGroupLabel(rows: InvoiceRow[]): string {
    const receipt = rows.find(r => r.to_company === '(주)한국에이원')
    const memo = receipt?.memo ?? ''
    if (memo.includes('동국제강')) return '동국제강 커미션'
    if (memo.includes('현대제철')) return '현대제철 커미션'
    return receipt?.from_company ? `${receipt.from_company} 커미션` : '커미션'
  }

  return (
    <div className="hidden md:block card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {sortedGroups.map(({ pid, rows }) => {
              const displayName = pid.startsWith('__comm_') ? commGroupLabel(rows)
                                : pid === '__none__'        ? '기타'
                                : (productMap.get(pid) ?? pid)
              const groupTotal  = rows.reduce((s, r) => s + Number(r.total_amount), 0)
              const groupUnpaid = rows.filter(r => !r.paid_at).reduce((s, r) => s + Number(r.total_amount), 0)

              return (
                <React.Fragment key={pid}>
                  {/* 품목 헤더 */}
                  <tr className={`border-t-2 ${pid.startsWith('__comm_') ? 'border-amber-300 bg-amber-50' : 'border-gray-300 bg-gray-100'}`}>
                    <td colSpan={6} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${pid.startsWith('__comm_') ? 'text-amber-800' : 'text-gray-800'}`}>{displayName}</span>
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
                    const badge   = depBadgeFor(inv, deps)
                    const bd      = depBreakdownFor(inv, deps)
                    const paidAmt = inv.paid_amount === null ? null : Number(inv.paid_amount)
                    const shortfall = paidAmt === null ? 0 : Number(inv.total_amount) - paidAmt
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
                          {badge && (
                            <p className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-xs font-medium leading-snug ${BADGE_TONE[badge.tone]}`}>
                              {badge.text}
                            </p>
                          )}
                          {bd && <DepBreakdownNote bd={bd} />}
                        </td>
                        <td className="table-td text-right tabular-nums whitespace-nowrap">
                          {fmtKrw(Number(inv.supply_amount))}
                        </td>
                        <td className="table-td text-right tabular-nums text-gray-500 whitespace-nowrap">
                          {Number(inv.vat_amount) > 0
                            ? fmtKrw(Number(inv.vat_amount))
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="table-td text-right tabular-nums font-semibold whitespace-nowrap">
                          {fmtKrw(Number(inv.total_amount))}
                        </td>
                        <td className="table-td text-gray-600 whitespace-nowrap">
                          {inv.invoice_basis_date ?? '—'}
                        </td>
                        <td className="table-td text-gray-600 whitespace-nowrap font-medium">
                          {inv.payment_due_date ?? '—'}
                        </td>
                        <td className="table-td text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="date"
                              value={inv.paid_at ? inv.paid_at.slice(0, 10) : ''}
                              onChange={e => onSetPaidDate(inv.id, e.target.value || null)}
                              className="border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              onClick={() => onOpenPayment(inv)}
                              title="실입금액이 계산서와 다를 때"
                              className="shrink-0 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                            >
                              금액
                            </button>
                            {inv.paid_at && (
                              <button
                                onClick={() => onSetPaidDate(inv.id, null)}
                                title="지급완료 취소"
                                className="shrink-0 px-1 text-xs text-gray-400 hover:text-red-500"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          {shortfall > 0 && (
                            <p className="mt-1 text-xs text-red-600 tabular-nums whitespace-nowrap">
                              실입금 {fmtKrw(paidAmt!)} (−{fmtKrw(shortfall)})
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
