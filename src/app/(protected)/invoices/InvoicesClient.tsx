'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toMessage } from '@/lib/error'
import { fmtKrw } from '@/lib/margin'
import { shiftMonths } from '@/lib/date'
import {
  generateInvoices,
  generateCommissionInvoices,
  mapDeliveries,
  PRODUCT_ORDER,
  type DeliveryRawForInvoice,
  type FxRateRaw,
  type InvoiceRow,
  type CommissionForInvoice,
} from '@/lib/invoice-generator'
import { replaceInvoices, updatePaidDate } from './actions'
import InvoiceTable from './InvoiceTable'

export default function InvoicesClient({
  yearMonth,
  initialDeliveries,
  initialInvoices,
  fxRates,
  initialCommissions,
  products,
}: {
  yearMonth: string
  initialDeliveries: DeliveryRawForInvoice[]
  initialInvoices: InvoiceRow[]
  fxRates: FxRateRaw[]
  initialCommissions: CommissionForInvoice[]
  products: Array<{ id: string; name: string; display_name: string | null }>
}) {
  const router        = useRouter()
  const [invoices,   setInvoices]   = useState<InvoiceRow[]>(initialInvoices)
  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(yearMonth)
  const autoGenRef = useRef(false)

  // 커미션 계산서 stale 감지
  // delivery_year_month: 동국제강 = M-2, 현대제철 = M-1 (커미션 등록 월)
  const hasCommInvoices = initialInvoices.some(inv => inv.invoice_type === 'commission')
  const hasStaleComm    = initialInvoices.some(inv => {
    if (inv.invoice_type !== 'commission' || inv.delivery_year_month === null) return false
    const expected = (inv.memo ?? '').includes('현대제철')
      ? shiftMonths(yearMonth, -1)
      : shiftMonths(yearMonth, -2)
    return inv.delivery_year_month !== expected
  })
  // 커미션 데이터는 있는데 커미션 계산서가 없는 경우도 재생성
  const needsRegen = initialInvoices.length === 0 ||
    hasStaleComm ||
    (initialCommissions.length > 0 && !hasCommInvoices)

  // 품목명 맵 (product_id → display_name)
  // products 전체 목록을 먼저 채워 UUID fallback 방지
  const productMap = new Map<string, string>()
  const productOrderMap = new Map<string, number>()
  for (const p of products) {
    productMap.set(p.id, p.display_name ?? p.name)
    const idx = PRODUCT_ORDER.indexOf(p.name.toUpperCase())
    productOrderMap.set(p.id, idx >= 0 ? idx : 999)
  }
  // 입고 데이터에서 추가 정보 보완 (이미 products로 채웠으므로 순서 정보만 재확인)
  for (const d of initialDeliveries) {
    if (d.product) {
      productMap.set(d.product_id, d.product.display_name ?? d.product.name)
      const idx = PRODUCT_ORDER.indexOf(d.product.name.toUpperCase())
      productOrderMap.set(d.product_id, idx >= 0 ? idx : 999)
    }
  }

  // 계산서 생성
  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const mapped = mapDeliveries(initialDeliveries, fxRates)
      if (mapped.length === 0 && initialCommissions.length === 0) {
        setError('이 달에 입고 데이터가 없거나 계약 정보가 없습니다.')
        return
      }

      const generated = [
        ...generateInvoices(mapped, yearMonth),
        ...generateCommissionInvoices(initialCommissions, yearMonth),
      ]
      if (generated.length === 0) {
        setError('생성된 계산서가 없습니다. 등록된 품목 타입을 확인하세요.')
        return
      }

      const result = await replaceInvoices(yearMonth, generated)
      if (result.error) throw new Error(result.error)

      setInvoices((result.data ?? []) as unknown as InvoiceRow[])
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setGenerating(false)
    }
  }, [initialDeliveries, initialCommissions, fxRates, yearMonth])

  // 자동 생성: 데이터는 있는데 계산서가 없거나 커미션 월이 오래된 경우
  useEffect(() => {
    if (!autoGenRef.current && needsRegen &&
        (initialDeliveries.length > 0 || initialCommissions.length > 0)) {
      autoGenRef.current = true
      handleGenerate()
    }
  }, [handleGenerate, needsRegen, initialDeliveries.length, initialCommissions.length])

  // 지급완료일 업데이트 (optimistic update)
  async function handleSetPaidDate(id: string, paidDate: string | null) {
    const snapshot = invoices
    setInvoices(prev =>
      prev.map(inv =>
        inv.id === id ? { ...inv, is_paid: paidDate !== null, paid_at: paidDate } : inv
      )
    )
    try {
      const result = await updatePaidDate(id, paidDate)
      if (result.error) {
        setInvoices(snapshot)
        setError(result.error)
      }
    } catch (e) {
      setInvoices(snapshot)
      setError(toMessage(e))
    }
  }

  // 월 이동
  function handleSelectMonth() {
    router.push(`/invoices?month=${selectedMonth}`)
  }

  // 집계
  const totalAmount  = invoices.reduce((s, inv) => s + Number(inv.total_amount), 0)
  const unpaidAmount = invoices.filter(inv => !inv.paid_at).reduce((s, inv) => s + Number(inv.total_amount), 0)
  const paidAmount   = invoices.filter(inv =>  inv.paid_at).reduce((s, inv) => s + Number(inv.total_amount), 0)

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">지급 일정 관리</h2>
        <p className="text-sm text-gray-500 mt-0.5">선택 월의 계산서 발행일 및 지급 예정일</p>

        <div className="flex items-center gap-2 mt-3">
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={handleSelectMonth} className="btn-primary">
            선택
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || (initialDeliveries.length === 0 && initialCommissions.length === 0)}
            className="btn-secondary text-xs disabled:opacity-40"
          >
            재생성
          </button>
        </div>
      </div>

      {/* 생성 중 */}
      {generating && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-700">
          {yearMonth} 발행 지시를 생성하고 있습니다…
        </div>
      )}

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
          <p className="text-xs text-gray-400 mt-0.5">{invoices.filter(i => !i.paid_at).length}건</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 font-medium">지급 완료</p>
          <p className="text-xl font-bold text-green-600 mt-1">{fmtKrw(paidAmount)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{invoices.filter(i => i.paid_at).length}건</p>
        </div>
      </div>

      {/* 계산서 목록 */}
      {invoices.length === 0 && !generating ? (
        <div className="card px-4 py-12 text-center">
          <p className="text-sm text-gray-400">
            {initialDeliveries.length === 0 && initialCommissions.length === 0
              ? `${yearMonth} 입고 및 커미션 데이터가 없습니다.`
              : '발행 지시 데이터가 없습니다.'}
          </p>
        </div>
      ) : (
        <InvoiceTable
          invoices={invoices}
          productMap={productMap}
          productOrderMap={productOrderMap}
          onSetPaidDate={handleSetPaidDate}
        />
      )}
    </div>
  )
}
