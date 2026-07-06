'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toMessage } from '@/lib/error'
import { fmtKrw } from '@/lib/margin'
import { shiftMonths } from '@/lib/date'
import type { MonthlyDepreciation } from '@/types'
import {
  needsInvoiceRegen,
  PRODUCT_ORDER,
  type DeliveryRawForInvoice,
  type InvoiceRow,
  type CommissionForInvoice,
} from '@/lib/invoice-generator'
import { regenerateInvoices, updatePaidDate } from './actions'
import InvoiceTable from './InvoiceTable'
import InvoiceCardList from './InvoiceCardList'
import DepreciationPanel from './DepreciationPanel'

type GS = { supply: number; vat: number; total: number }
function sumG(rows: InvoiceRow[]): GS {
  return {
    supply: rows.reduce((s, r) => s + Number(r.supply_amount), 0),
    vat:    rows.reduce((s, r) => s + Number(r.vat_amount), 0),
    total:  rows.reduce((s, r) => s + Number(r.total_amount), 0),
  }
}
function splitPaid(rows: InvoiceRow[]) {
  return {
    all:    sumG(rows),
    unpaid: sumG(rows.filter(r => !r.paid_at)),
    paid:   sumG(rows.filter(r =>  r.paid_at)),
  }
}

export default function InvoicesClient({
  yearMonth,
  initialDeliveries,
  initialInvoices,
  initialCommissions,
  products,
  initialMonthlyDeps,
}: {
  yearMonth: string
  initialDeliveries: DeliveryRawForInvoice[]
  initialInvoices: InvoiceRow[]
  initialCommissions: CommissionForInvoice[]
  products: Array<{ id: string; name: string; display_name: string | null }>
  initialMonthlyDeps: MonthlyDepreciation[]
}) {
  const router        = useRouter()
  const [invoices,   setInvoices]   = useState<InvoiceRow[]>(initialInvoices)
  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(yearMonth)
  const autoGenRef = useRef(false)

  // 감가 저장 등 router.refresh() 후 서버에서 재생성된 계산서를 state에 반영
  // (key={yearMonth}는 월 변경 시에만 리마운트되므로 effect로 동기화)
  useEffect(() => { setInvoices(initialInvoices) }, [initialInvoices])

  // 재생성 필요 감지: 계산서 없음 / 커미션 월 stale / 등록된 커미션의 계산서 누락
  const needsRegen = needsInvoiceRegen(
    initialInvoices,
    initialCommissions.map(c => c.id),
    yearMonth,
  )

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

  // 계산서 생성 — 서버가 입고·커미션을 fresh 조회해 생성 (stale props 방지)
  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const result = await regenerateInvoices(yearMonth)
      if (result.error) throw new Error(result.error)

      setInvoices((result.data ?? []) as unknown as InvoiceRow[])
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setGenerating(false)
    }
  }, [yearMonth])

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
  const costStats     = splitPaid(invoices.filter(i => i.invoice_type === 'cost'))
  const salesStats    = splitPaid(invoices.filter(i => i.invoice_type === 'sales'))
  const commRecvStats = splitPaid(invoices.filter(i => i.invoice_type === 'commission' && i.from_company === '화림'))
  const commPayStats  = splitPaid(invoices.filter(i => i.invoice_type === 'commission' && i.from_company !== '화림'))

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
      <div className="card mb-6 overflow-hidden">
        <div className="overflow-x-auto">
        <p className="md:hidden text-xs text-gray-400 px-3 pt-2 pb-2">부가세 별도</p>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="w-28 bg-gray-50 border-b border-gray-200" />
              {[
                { label: '매입 계산서', cls: 'bg-orange-50 text-orange-700' },
                { label: '매출 계산서', cls: 'bg-blue-50 text-blue-700'     },
                { label: '커미션 수령', cls: 'bg-purple-50 text-purple-700' },
                { label: '커미션 지급', cls: 'bg-violet-50 text-violet-700' },
              ].map(col => (
                <th key={col.label} className={`px-2 py-2 md:px-4 md:py-3 text-sm font-bold text-center border-b border-l border-gray-200 ${col.cls}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: '전체 금액',   shortLabel: '전체',   accent: 'border-l-gray-400',  labelCls: 'text-gray-700',  totalColor: 'text-gray-900',  stats: [costStats.all,    salesStats.all,    commRecvStats.all,    commPayStats.all]    },
              { label: '미지급 잔액', shortLabel: '미지급', accent: 'border-l-red-400',   labelCls: 'text-red-600',   totalColor: 'text-red-600',   stats: [costStats.unpaid, salesStats.unpaid, commRecvStats.unpaid, commPayStats.unpaid] },
              { label: '지급 완료',   shortLabel: '완료',   accent: 'border-l-green-500', labelCls: 'text-green-700', totalColor: 'text-green-700', stats: [costStats.paid,   salesStats.paid,   commRecvStats.paid,   commPayStats.paid]   },
            ].map(row => (
              <tr key={row.label} className="border-t border-gray-200">
                <td className={`pl-2 pr-2 md:pl-3 md:pr-4 py-2 md:py-3 bg-gray-50 text-sm font-bold whitespace-nowrap border-l-4 ${row.accent} ${row.labelCls}`}>
                  <span className="hidden md:inline">{row.label}</span>
                  <span className="md:hidden">{row.shortLabel}</span>
                </td>
                {row.stats.map((gs, i) => (
                  <td key={i} className="px-2 py-2 md:px-4 md:py-3 border-l border-gray-200 text-left">
                    <span className="md:hidden tabular-nums text-sm font-semibold whitespace-nowrap">
                      {fmtKrw(gs.supply)}
                    </span>
                    <div className="hidden md:block align-top">
                      <div className="flex justify-between gap-4 text-xs text-gray-500">
                        <span>공급가액</span>
                        <span className="tabular-nums whitespace-nowrap">{fmtKrw(gs.supply)}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-xs text-gray-400 mt-0.5">
                        <span>부가세</span>
                        <span className="tabular-nums whitespace-nowrap">{fmtKrw(gs.vat)}</span>
                      </div>
                      <div className={`flex justify-between gap-4 text-sm font-bold mt-1.5 ${row.totalColor}`}>
                        <span>합계</span>
                        <span className="tabular-nums whitespace-nowrap">{fmtKrw(gs.total)}</span>
                      </div>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* 분탄 감가 정산 — 렘코 미수 추적 */}
      {(() => {
        const buntan = products.find(p => p.name.toUpperCase() === 'BUNTAN')
        if (!buntan) return null
        return (
          <DepreciationPanel
            productId={buntan.id}
            productLabel={buntan.display_name ?? '분탄'}
            deps={initialMonthlyDeps.filter(d => d.product_id === buntan.id)}
            defaultYearMonth={shiftMonths(yearMonth, -1)}
          />
        )
      })()}

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
        <>
          <InvoiceTable
            invoices={invoices}
            productMap={productMap}
            productOrderMap={productOrderMap}
            onSetPaidDate={handleSetPaidDate}
          />
          <InvoiceCardList
            invoices={invoices}
            productMap={productMap}
            productOrderMap={productOrderMap}
          />
        </>
      )}
    </div>
  )
}
