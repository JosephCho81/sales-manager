'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { replaceInvoices, deleteAllInvoices, toggleInvoicePaid } from './actions'
import { generateInvoices, type DeliveryForInvoice } from '@/lib/invoice-generator'
import { fmtKrw } from '@/lib/margin'

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────
type InvoiceRow = {
  id: string
  year_month: string
  product_id: string | null
  delivery_ids: string[] | null
  from_company: string
  to_company: string
  supply_amount: number
  vat_amount: number
  total_amount: number
  invoice_basis_date: string | null
  issue_deadline: string | null
  payment_due_date: string | null
  is_paid: boolean
  paid_at: string | null
  memo: string | null
  invoice_type: string | null
}

type DeliveryRaw = {
  id: string
  year_month: string
  delivery_date: string | null
  product_id: string
  quantity_kg: number
  addl_quantity_kg: number | null
  addl_margin_per_ton: number | null
  hoejin_shortage_kg: number | null
  hoejin_shortage_price: number | null
  product: { id: string; name: string; display_name: string; vat: string } | null
  contract: {
    id: string
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
  } | null
}

type FxRateRaw = {
  id: string
  bl_date: string
  product_id: string
  rate_krw_per_usd: number
}

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  sales: '매출',
  cost: '원가',
  commission: '커미션',
  other: '기타',
}
const TYPE_COLORS: Record<string, string> = {
  sales: 'bg-blue-100 text-blue-700',
  cost: 'bg-orange-100 text-orange-700',
  commission: 'bg-purple-100 text-purple-700',
  other: 'bg-gray-100 text-gray-600',
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────
export default function InvoicesClient({
  yearMonth,
  initialDeliveries,
  initialInvoices,
  fxRates,
}: {
  yearMonth: string
  initialDeliveries: DeliveryRaw[]
  initialInvoices: InvoiceRow[]
  fxRates: FxRateRaw[]
}) {
  const router = useRouter()
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices)
  const [generating, setGenerating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 품목명 맵 (product_id → display_name)
  const productMap = new Map<string, string>()
  for (const d of initialDeliveries) {
    if (d.product) productMap.set(d.product_id, d.product.display_name)
  }

  // 월 변경 시 네비게이션
  function handleMonthChange(e: React.ChangeEvent<HTMLInputElement>) {
    router.push(`/invoices?month=${e.target.value}`)
  }

  // FeSi BL 날짜 기준 환율 맵
  const fxRateMap = new Map<string, number>()
  for (const r of fxRates) {
    fxRateMap.set(`${r.product_id}:${r.bl_date}`, Number(r.rate_krw_per_usd))
  }

  // 입고 데이터를 DeliveryForInvoice 형식으로 변환
  function mapDeliveries(): DeliveryForInvoice[] {
    return initialDeliveries
      .filter(d => d.product && d.contract)
      .map(d => ({
        id: d.id,
        year_month: d.year_month,
        delivery_date: d.delivery_date,
        product_id: d.product_id,
        product_name: d.product!.name,
        product_vat: d.product!.vat,
        quantity_kg: Number(d.quantity_kg),
        addl_quantity_kg: d.addl_quantity_kg != null ? Number(d.addl_quantity_kg) : null,
        addl_margin_per_ton: d.addl_margin_per_ton != null ? Number(d.addl_margin_per_ton) : null,
        hoejin_shortage_kg: d.hoejin_shortage_kg != null ? Number(d.hoejin_shortage_kg) : null,
        hoejin_shortage_price: d.hoejin_shortage_price != null ? Number(d.hoejin_shortage_price) : null,
        fx_rate: d.delivery_date
          ? (fxRateMap.get(`${d.product_id}:${d.delivery_date}`) ?? null)
          : null,
        contract: {
          sell_price: Number(d.contract!.sell_price),
          cost_price: Number(d.contract!.cost_price),
          currency: d.contract!.currency,
          reference_exchange_rate:
            d.contract!.reference_exchange_rate != null
              ? Number(d.contract!.reference_exchange_rate)
              : null,
        },
      }))
  }

  // 발행 지시 생성
  async function handleGenerate() {
    if (invoices.length > 0) {
      if (
        !confirm(
          `${yearMonth} 기존 발행 지시 ${invoices.length}건을 삭제하고 재생성합니다.\n계속하시겠습니까?`
        )
      )
        return
    }

    setGenerating(true)
    setError(null)
    try {
      const mapped = mapDeliveries()
      if (mapped.length === 0) {
        setError('이 달에 입고 데이터가 없거나 계약 정보가 없습니다.')
        return
      }

      const generated = generateInvoices(mapped, yearMonth, fxRateMap)
      if (generated.length === 0) {
        setError('생성된 계산서가 없습니다. 등록된 품목 타입을 확인하세요.')
        return
      }

      const rows = generated.map(inv => ({
        year_month: inv.year_month,
        product_id: inv.product_id,
        delivery_ids: inv.delivery_ids,
        from_company: inv.from_company,
        to_company: inv.to_company,
        supply_amount: inv.supply_amount,
        vat_amount: inv.vat_amount,
        total_amount: inv.total_amount,
        invoice_basis_date: inv.invoice_basis_date,
        issue_deadline: inv.issue_deadline,
        payment_due_date: inv.payment_due_date,
        is_paid: false,
        invoice_type: inv.invoice_type,
        memo: inv.memo,
      }))

      const result = await replaceInvoices(yearMonth, rows)
      if (result.error) throw new Error(result.error)

      setInvoices((result.data ?? []) as InvoiceRow[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  // 전체 삭제
  async function handleDeleteAll() {
    if (!confirm(`${yearMonth} 발행 지시 ${invoices.length}건을 모두 삭제합니다.`)) return
    setDeleting(true)
    setError(null)
    try {
      const result = await deleteAllInvoices(yearMonth)
      if (result.error) throw new Error(result.error)
      setInvoices([])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
    }
  }

  // 지급완료 토글
  async function handleTogglePaid(id: string, currentPaid: boolean) {
    const newPaid = !currentPaid
    const paidAt = newPaid ? new Date().toISOString() : null
    // 낙관적 업데이트
    setInvoices(prev =>
      prev.map(inv => (inv.id === id ? { ...inv, is_paid: newPaid, paid_at: paidAt } : inv))
    )
    try {
      const result = await toggleInvoicePaid(id, newPaid, paidAt)
      if (result.error) {
        setInvoices(prev =>
          prev.map(inv => (inv.id === id ? { ...inv, is_paid: currentPaid } : inv))
        )
        setError(result.error)
      }
    } catch (e) {
      setInvoices(prev =>
        prev.map(inv => (inv.id === id ? { ...inv, is_paid: currentPaid } : inv))
      )
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // ─── 집계 ───────────────────────────────────
  const totalAmount = invoices.reduce((s, inv) => s + Number(inv.total_amount), 0)
  const unpaidAmount = invoices
    .filter(inv => !inv.is_paid)
    .reduce((s, inv) => s + Number(inv.total_amount), 0)
  const paidAmount = invoices
    .filter(inv => inv.is_paid)
    .reduce((s, inv) => s + Number(inv.total_amount), 0)

  // ─── 품목별 그룹 ─────────────────────────────
  const grouped = new Map<string, InvoiceRow[]>()
  for (const inv of invoices) {
    const key = inv.product_id ?? '__none__'
    const list = grouped.get(key) ?? []
    list.push(inv)
    grouped.set(key, list)
  }

  // ─── 렌더 ────────────────────────────────────
  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">계산서 발행 지시</h2>
          <p className="text-sm text-gray-500 mt-0.5">월별 계산서 발행 지시 목록 관리</p>
        </div>
        <input
          type="month"
          value={yearMonth}
          onChange={handleMonthChange}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 오류 */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-gray-500 font-medium">전체 계산서 금액</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmtKrw(totalAmount)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{invoices.length}건</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 font-medium">미지급 잔액</p>
          <p className="text-xl font-bold text-red-600 mt-1">{fmtKrw(unpaidAmount)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {invoices.filter(i => !i.is_paid).length}건
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 font-medium">지급 완료</p>
          <p className="text-xl font-bold text-green-600 mt-1">{fmtKrw(paidAmount)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {invoices.filter(i => i.is_paid).length}건
          </p>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleGenerate}
          disabled={generating || initialDeliveries.length === 0}
          className="btn-primary disabled:opacity-50"
        >
          {generating ? '생성 중…' : '발행 지시 생성'}
        </button>
        {invoices.length > 0 && (
          <button
            onClick={handleDeleteAll}
            disabled={deleting}
            className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleting ? '삭제 중…' : '전체 삭제'}
          </button>
        )}
        <span className="text-sm text-gray-400">입고 {initialDeliveries.length}건 기준</span>
      </div>

      {/* 계산서 목록 */}
      {invoices.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <p className="text-sm text-gray-400">
            {initialDeliveries.length === 0
              ? `${yearMonth} 입고 데이터가 없습니다.`
              : `발행 지시가 없습니다. '발행 지시 생성' 버튼을 누르세요.`}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th w-20">타입</th>
                  <th className="table-th">발행회사 → 수취회사</th>
                  <th className="table-th text-right">공급가액</th>
                  <th className="table-th text-right">VAT</th>
                  <th className="table-th text-right">합계</th>
                  <th className="table-th whitespace-nowrap">발행기준일</th>
                  <th className="table-th whitespace-nowrap">지급예정일</th>
                  <th className="table-th text-center w-20">지급완료</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([pid, rows]) => {
                  const displayName =
                    pid === '__none__' ? '기타' : (productMap.get(pid) ?? pid)
                  const groupUnpaid = rows
                    .filter(r => !r.is_paid)
                    .reduce((s, r) => s + Number(r.total_amount), 0)
                  return (
                    <React.Fragment key={pid}>
                      {/* 품목 헤더 행 */}
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={7} className="px-4 py-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          {displayName}
                        </td>
                        <td className="px-4 py-1.5 text-xs text-right text-red-500 font-medium">
                          미지급 {fmtKrw(groupUnpaid)}
                        </td>
                      </tr>
                      {rows.map(inv => {
                        const typeKey = inv.invoice_type ?? 'other'
                        return (
                          <tr
                            key={inv.id}
                            className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${
                              inv.is_paid ? 'opacity-40' : ''
                            }`}
                          >
                            <td className="table-td">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                                  TYPE_COLORS[typeKey] ?? TYPE_COLORS.other
                                }`}
                              >
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
                                <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                                  {inv.memo}
                                </p>
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
                            <td className="table-td text-gray-600 whitespace-nowrap">
                              {inv.payment_due_date ?? '—'}
                            </td>
                            <td className="table-td text-center">
                              <input
                                type="checkbox"
                                checked={inv.is_paid}
                                onChange={() => handleTogglePaid(inv.id, inv.is_paid)}
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
              {/* 총합 푸터 */}
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td colSpan={2} className="px-4 py-2 text-sm font-semibold text-gray-700">
                    합계
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums">
                    {fmtKrw(invoices.reduce((s, inv) => s + Number(inv.supply_amount), 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-gray-500 tabular-nums">
                    {fmtKrw(invoices.reduce((s, inv) => s + Number(inv.vat_amount), 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-bold tabular-nums">
                    {fmtKrw(totalAmount)}
                  </td>
                  <td colSpan={2} />
                  <td className="px-4 py-2 text-center text-xs text-gray-400">
                    {invoices.filter(i => i.is_paid).length}/{invoices.length}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
