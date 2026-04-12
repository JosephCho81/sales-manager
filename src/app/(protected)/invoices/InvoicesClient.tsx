'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toMessage } from '@/lib/error'
import { fmtKrw } from '@/lib/margin'
import {
  generateInvoices,
  mapDeliveries,
  type DeliveryRawForInvoice,
  type FxRateRaw,
  type InvoiceRow,
} from '@/lib/invoice-generator'
import { replaceInvoices, updatePaidDate } from './actions'
import InvoiceTable from './InvoiceTable'

export default function InvoicesClient({
  yearMonth,
  initialDeliveries,
  initialInvoices,
  fxRates,
}: {
  yearMonth: string
  initialDeliveries: DeliveryRawForInvoice[]
  initialInvoices: InvoiceRow[]
  fxRates: FxRateRaw[]
}) {
  const router        = useRouter()
  const [invoices,   setInvoices]   = useState<InvoiceRow[]>(initialInvoices)
  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(yearMonth)
  const autoGenRef = useRef(false)

  // 품목명 맵 (product_id → display_name)
  const productMap = new Map<string, string>()
  for (const d of initialDeliveries) {
    if (d.product) productMap.set(d.product_id, d.product.display_name)
  }

  // 계산서 생성
  const handleGenerate = useCallback(async () => {
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

      const result = await replaceInvoices(yearMonth, generated)
      if (result.error) throw new Error(result.error)

      setInvoices((result.data ?? []) as unknown as InvoiceRow[])
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setGenerating(false)
    }
  }, [initialDeliveries, fxRates, yearMonth])

  // 자동 생성: 입고는 있는데 계산서가 없을 때
  useEffect(() => {
    if (!autoGenRef.current && initialInvoices.length === 0 && initialDeliveries.length > 0) {
      autoGenRef.current = true
      handleGenerate()
    }
  }, [handleGenerate, initialInvoices.length, initialDeliveries.length])

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
            disabled={generating || initialDeliveries.length === 0}
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
            {initialDeliveries.length === 0
              ? `${yearMonth} 입고 데이터가 없습니다.`
              : '발행 지시 데이터가 없습니다.'}
          </p>
        </div>
      ) : (
        <InvoiceTable
          invoices={invoices}
          productMap={productMap}
          onSetPaidDate={handleSetPaidDate}
        />
      )}
    </div>
  )
}
