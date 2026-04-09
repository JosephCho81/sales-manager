'use client'
import { toMessage } from '@/lib/error'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { replaceInvoices, deleteAllInvoices, toggleInvoicePaid } from './actions'
import { generateInvoices } from '@/lib/invoice-generator'
import { mapDeliveries, type DeliveryRaw, type FxRateRaw } from '@/lib/invoice-generator/mapper'
import { fmtKrw } from '@/lib/margin'
import InvoiceTable from './InvoiceTable'
import type { InvoiceRow } from './types'

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
      const mapped = mapDeliveries(initialDeliveries, fxRates)
      if (mapped.length === 0) {
        setError('이 달에 입고 데이터가 없거나 계약 정보가 없습니다.')
        return
      }

      const generated = generateInvoices(mapped, yearMonth)
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
      setError(toMessage(e))
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
      setError(toMessage(e))
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
      setError(toMessage(e))
    }
  }

  // ─── 집계 ───────────────────────────────────
  const totalAmount = invoices.reduce((s, inv) => s + Number(inv.total_amount), 0)
  const unpaidAmount = invoices.filter(inv => !inv.is_paid).reduce((s, inv) => s + Number(inv.total_amount), 0)
  const paidAmount = invoices.filter(inv => inv.is_paid).reduce((s, inv) => s + Number(inv.total_amount), 0)

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
        <InvoiceTable
          invoices={invoices}
          productMap={productMap}
          onTogglePaid={handleTogglePaid}
        />
      )}
    </div>
  )
}
