'use client'

import React, { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { calcMarginFromContract, calcAddlMargin, splitMargin, fmtKrw, fmtNum } from '@/lib/margin'
import { addDays, monthEnd, nthDay, shiftMonths } from '@/lib/date'
import HyundaiShortageSection from './HyundaiShortageSection'
import type { HyundaiDeliveryRow as DeliveryRow, HyundaiInvoiceRow as InvoiceRow, ShortageEntry } from './types'

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────
function getPeriodLabel(day: number): string {
  if (day <= 10) return '1~10일'
  if (day <= 20) return '11~20일'
  return '21일~말일'
}

function getPeriodBasisDate(ym: string, day: number): string {
  if (day <= 10) return nthDay(ym, 10)
  if (day <= 20) return nthDay(ym, 20)
  return monthEnd(ym)
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export default function HyundaiClient({
  yearMonth,
  al30ProductId,
  initialDeliveries,
  initialInvoices,
  initialShortage,
}: {
  yearMonth: string
  al30ProductId: string | null
  initialDeliveries: DeliveryRow[]
  initialInvoices: InvoiceRow[]
  initialShortage: ShortageEntry[]
}) {
  const router = useRouter()

  // ── 10일 단위 그룹화 ──
  const periods = useMemo(() => {
    const groups: Record<string, DeliveryRow[]> = { '1~10일': [], '11~20일': [], '21일~말일': [] }
    for (const d of initialDeliveries) {
      const day = d.delivery_date ? parseInt(d.delivery_date.slice(8, 10)) : 15
      groups[getPeriodLabel(day)].push(d)
    }
    return groups
  }, [initialDeliveries])

  const periodSummaries = useMemo(() =>
    (['1~10일', '11~20일', '21일~말일'] as const).map(label => {
      const deliveries = periods[label]
      if (deliveries.length === 0) return { label, deliveries: [], sellTotal: 0, marginTotal: 0 }
      const day = label === '1~10일' ? 5 : label === '11~20일' ? 15 : 25
      const basisDate = getPeriodBasisDate(yearMonth, day)
      let sellTotal = 0, marginTotal = 0
      for (const d of deliveries) {
        if (!d.contract) continue
        const m = calcMarginFromContract(d.contract, d.quantity_kg)
        sellTotal   += m.sell_price * m.quantity_ton
        marginTotal += m.total_margin
        if (d.addl_quantity_kg && d.addl_margin_per_ton) {
          marginTotal += calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton).total_margin
        }
      }
      return {
        label, deliveries, sellTotal, marginTotal,
        qtyTon: deliveries.reduce((s, d) => s + d.quantity_kg / 1000, 0),
        basisDate,
        billDueDate: addDays(basisDate, 60),
      }
    }), [periods, yearMonth]
  )

  const monthTotal = useMemo(() => {
    let sell = 0, margin = 0
    for (const d of initialDeliveries) {
      if (!d.contract) continue
      const m = calcMarginFromContract(d.contract, d.quantity_kg)
      sell += m.sell_price * m.quantity_ton; margin += m.total_margin
      if (d.addl_quantity_kg && d.addl_margin_per_ton) {
        margin += calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton).total_margin
      }
    }
    return { sell, margin, ...splitMargin(margin) }
  }, [initialDeliveries])

  // ── 계산서 분류 ──
  const salesInvoices = initialInvoices.filter(i => i.invoice_type === 'sales')
  const costInvoice   = initialInvoices.find(i => i.invoice_type === 'cost' && i.to_company === '화림')
  const commInvoices  = initialInvoices.filter(i => i.invoice_type === 'commission' && i.from_company === '한국에이원')

  const next2M = shiftMonths(yearMonth, 2)

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────
  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">현대제철 AL30 전용 뷰</h2>
          <p className="text-sm text-gray-500 mt-0.5">10일 단위 계산서 · 60일 어음 · 부족분 커미션</p>
        </div>
        <input
          type="month" value={yearMonth}
          onChange={e => router.push(`/hyundai?month=${e.target.value}`)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* ─── 섹션 1: 10일 단위 입고 현황 ─── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        {yearMonth} 입고 현황 — 10일 단위
      </h3>
      {initialDeliveries.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-gray-400 mb-6">
          {yearMonth} AL30 입고 데이터 없음
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {periodSummaries.map(ps => {
            if (ps.deliveries.length === 0) return null
            const periodInv = salesInvoices.find(i => i.memo?.includes(ps.label))
            return (
              <div key={ps.label} className="card overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-800">{ps.label}</span>
                    <span className="text-xs text-gray-500">발행기준일 {ps.basisDate}</span>
                    <span className="text-xs text-blue-600 font-medium">어음 만기 {addDays(ps.basisDate!, 60)}</span>
                  </div>
                  {periodInv && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      periodInv.is_paid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {periodInv.is_paid ? '어음 완료' : '어음 미결'}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-th">입고일</th>
                        <th className="table-th text-right">물량(톤)</th>
                        <th className="table-th text-right">공급가액</th>
                        <th className="table-th text-right">VAT</th>
                        <th className="table-th text-right">합계</th>
                        <th className="table-th">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ps.deliveries.map(d => {
                        if (!d.contract) return null
                        const m = calcMarginFromContract(d.contract, d.quantity_kg)
                        const supply = Math.round(m.sell_price * m.quantity_ton)
                        return (
                          <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="table-td">{d.delivery_date ?? d.year_month}</td>
                            <td className="table-td text-right tabular-nums">{fmtNum(m.quantity_ton, 3)}</td>
                            <td className="table-td text-right tabular-nums">{fmtKrw(supply)}</td>
                            <td className="table-td text-right tabular-nums text-gray-500">{fmtKrw(Math.round(supply * 0.1))}</td>
                            <td className="table-td text-right tabular-nums font-semibold">{fmtKrw(Math.round(supply * 1.1))}</td>
                            <td className="table-td text-gray-500 text-xs">{d.memo ?? ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-sm">
                        <td className="px-4 py-2">소계</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtNum(ps.qtyTon!, 3)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtKrw(ps.sellTotal!)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500">{fmtKrw(Math.round(ps.sellTotal! * 0.1))}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-bold">{fmtKrw(Math.round(ps.sellTotal! * 1.1))}</td>
                        <td className="px-4 py-2 text-xs text-blue-600">60일 어음 만기: {ps.billDueDate}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })}

          {/* 월 소계 */}
          <div className="card p-4 bg-blue-50 border-blue-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">{yearMonth} 월 소계</p>
                <div className="flex gap-6 text-sm">
                  <div>
                    <p className="text-xs text-blue-500">총 물량</p>
                    <p className="font-semibold">{fmtNum(initialDeliveries.reduce((s, d) => s + d.quantity_kg / 1000, 0), 3)} 톤</p>
                  </div>
                  <div><p className="text-xs text-blue-500">총 매출</p><p className="font-semibold">{fmtKrw(monthTotal.sell)}</p></div>
                  <div><p className="text-xs text-blue-500">총 마진</p><p className="font-bold text-blue-700">{fmtKrw(monthTotal.margin)}</p></div>
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="text-green-600">한국에이원 {fmtKrw(monthTotal.korea_a1)}</div>
                <div className="text-purple-600">금화 {fmtKrw(monthTotal.geumhwa)}</div>
                <div className="text-orange-600">라성 {fmtKrw(monthTotal.raseong)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 섹션 2: 발행 지시 현황 ─── */}
      {initialInvoices.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">발행 지시 현황</h3>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-th">타입</th>
                    <th className="table-th">발행 → 수취</th>
                    <th className="table-th text-right">공급가액</th>
                    <th className="table-th text-right">합계</th>
                    <th className="table-th">발행기준일</th>
                    <th className="table-th">지급예정일</th>
                    <th className="table-th">메모</th>
                    <th className="table-th text-center">완료</th>
                  </tr>
                </thead>
                <tbody>
                  {initialInvoices.map(inv => (
                    <tr key={inv.id} className={`border-t border-gray-100 hover:bg-gray-50 ${inv.is_paid ? 'opacity-40' : ''}`}>
                      <td className="table-td">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          inv.invoice_type === 'sales'      ? 'bg-blue-100 text-blue-700' :
                          inv.invoice_type === 'cost'       ? 'bg-orange-100 text-orange-700' :
                          inv.invoice_type === 'commission' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {inv.invoice_type === 'sales' ? '매출' : inv.invoice_type === 'cost' ? '원가' : '커미션'}
                        </span>
                      </td>
                      <td className="table-td text-sm">
                        <span className="font-medium">{inv.from_company}</span>
                        <span className="text-gray-400 mx-1">→</span>
                        <span className="font-medium">{inv.to_company}</span>
                      </td>
                      <td className="table-td text-right tabular-nums">{fmtKrw(Number(inv.supply_amount))}</td>
                      <td className="table-td text-right tabular-nums font-semibold">{fmtKrw(Number(inv.total_amount))}</td>
                      <td className="table-td text-gray-600 whitespace-nowrap">{inv.invoice_basis_date ?? '—'}</td>
                      <td className="table-td text-gray-600 whitespace-nowrap">{inv.payment_due_date ?? '—'}</td>
                      <td className="table-td text-xs text-gray-400 max-w-xs truncate">{inv.memo ?? ''}</td>
                      <td className="table-td text-center">
                        {inv.is_paid
                          ? <span className="text-green-500 font-bold">✓</span>
                          : <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {costInvoice && (
              <div className="px-4 py-2 bg-orange-50 border-t border-orange-100 text-xs text-orange-700">
                한국에이원→화림 원가: 당월 합산 1장 ({fmtKrw(Number(costInvoice.total_amount))}) — 익익월1일 지급 ({next2M}-01)
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 섹션 3+4: 부족분 커미션 (별도 컴포넌트) ─── */}
      <HyundaiShortageSection
        yearMonth={yearMonth}
        al30ProductId={al30ProductId}
        initialShortage={initialShortage}
        commInvoices={commInvoices}
      />
    </div>
  )
}
