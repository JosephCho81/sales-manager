'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fmtKrw, fmtNum } from '@/lib/margin'
import { getCurrentYearMonth } from '@/lib/date'
import { useMemo } from 'react'
import type { AllAnalytics } from './analytics-compute'
import MarginBarChart from './MarginBarChart'
import DateControls from './DateControls'
import SummaryCards from './SummaryCards'
import ProductTable from './ProductTable'

export default function AnalyticsClient({
  fromYM,
  toYM,
  mode,
  filterProduct,
  filterBuyer,
  availableProducts,
  precomputed,
}: {
  fromYM: string
  toYM: string
  mode: 'month' | 'range' | 'year'
  filterProduct: string
  filterBuyer: string
  availableProducts: [string, string][]
  precomputed: AllAnalytics
}) {
  const router = useRouter()

  // ── 날짜 컨트롤 상태 ──
  const [activeMode, setActiveMode] = useState<'month' | 'range' | 'year'>(mode)
  const [monthVal, setMonthVal] = useState(mode === 'month' ? fromYM : getCurrentYearMonth())
  const [fromVal,  setFromVal]  = useState(fromYM)
  const [toVal,    setToVal]    = useState(toYM)
  const [yearVal,  setYearVal]  = useState(
    mode === 'year' ? fromYM.slice(0, 4) : String(new Date().getFullYear())
  )

  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear()
    return Array.from({ length: thisYear - 2019 + 1 }, (_, i) => 2020 + i)
  }, [])

  // URL 빌더 — 날짜 + 필터를 한 번에 조합
  const buildUrl = useCallback((overrides: {
    mode?: typeof activeMode
    month?: string; from?: string; to?: string; year?: string
    product?: string; buyer?: string
  } = {}) => {
    const m   = overrides.mode    ?? activeMode
    const p   = overrides.product ?? filterProduct
    const b   = overrides.buyer   ?? filterBuyer
    const qs  = new URLSearchParams()

    if (m === 'month') qs.set('month', overrides.month ?? monthVal)
    if (m === 'range') {
      qs.set('from', overrides.from ?? fromVal)
      qs.set('to',   overrides.to   ?? toVal)
    }
    if (m === 'year') qs.set('year', overrides.year ?? yearVal)
    if (p !== 'all') qs.set('product', p)
    if (b !== 'all') qs.set('buyer',   b)

    return `/analytics?${qs.toString()}`
  }, [activeMode, monthVal, fromVal, toVal, yearVal, filterProduct, filterBuyer])

  // 날짜 조회 버튼
  const navigate = useCallback(() => {
    router.push(buildUrl())
  }, [buildUrl, router])

  // 필터 변경 시 즉시 서버 이동 (버튼 클릭 불필요)
  const handleFilterChange = useCallback((product: string, buyer: string) => {
    router.push(buildUrl({ product, buyer }))
  }, [buildUrl, router])

  const { totals, productRows, monthlyData, commissionsInPeriod } = precomputed

  const showChart   = fromYM !== toYM && monthlyData.length > 1
  const periodLabel = fromYM === toYM
    ? `${fromYM}`
    : `${fromYM} ~ ${toYM} (${monthlyData.length}개월)`

  const isFiltered = filterProduct !== 'all' || filterBuyer !== 'all'

  return (
    <div>
      {/* ── 헤더 ── */}
      <div className="mb-2">
        <h2 className="text-lg font-bold text-gray-900">매출·마진 현황</h2>
      </div>

      {/* ── 조회 컨트롤 ── */}
      <DateControls
        activeMode={activeMode} setActiveMode={setActiveMode}
        monthVal={monthVal}     setMonthVal={setMonthVal}
        fromVal={fromVal}       setFromVal={setFromVal}
        toVal={toVal}           setToVal={setToVal}
        yearVal={yearVal}       setYearVal={setYearVal}
        yearOptions={yearOptions}
        onNavigate={navigate}
        filterProduct={filterProduct}
        filterBuyer={filterBuyer}
        onFilterChange={handleFilterChange}
        availableProducts={availableProducts}
      />

      {/* ── 기간 라벨 ── */}
      <p className="text-xs text-gray-500 mb-2">
        📅 조회 기간: <span className="font-medium text-gray-700">{periodLabel}</span>
        {isFiltered && (
          <span className="ml-2 text-blue-600">
            {filterProduct !== 'all' && `[${availableProducts.find(([n]) => n === filterProduct)?.[1] ?? filterProduct}]`}
            {filterBuyer !== 'all' && ` [${filterBuyer}]`}
          </span>
        )}
      </p>

      {/* ── 3사 요약 카드 ── */}
      <SummaryCards totals={totals} commissionsInPeriod={commissionsInPeriod} />

      {/* ── 월별 마진 추이 차트 ── */}
      {showChart && (
        <>
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            월별 마진 추이
          </h3>
          <div className="card p-5 mb-8">
            <MarginBarChart data={monthlyData} />

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="table-th">월</th>
                    <th className="table-th text-right">물량(톤)</th>
                    <th className="table-th text-right">총마진</th>
                    <th className="table-th text-right text-green-700">한국에이원</th>
                    <th className="table-th text-right text-purple-700">금화</th>
                    <th className="table-th text-right text-orange-700">라성</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map(d => (
                    <tr key={d.ym} className={`border-t border-gray-100 ${d.totalMargin === 0 ? 'opacity-40' : 'hover:bg-gray-50'}`}>
                      <td className="table-td font-medium">{d.ym}</td>
                      <td className="table-td text-right tabular-nums">{fmtNum(d.qtyTon, 1)}</td>
                      <td className="table-td text-right tabular-nums font-medium text-blue-600">{fmtKrw(d.totalMargin)}</td>
                      <td className="table-td text-right tabular-nums text-green-600">{fmtKrw(d.a1)}</td>
                      <td className="table-td text-right tabular-nums text-purple-600">{fmtKrw(d.gm)}</td>
                      <td className="table-td text-right tabular-nums text-orange-600">{fmtKrw(d.rs)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className="px-4 py-2 text-xs">합계</td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums">{fmtNum(totals.qtyTon, 1)}</td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-blue-700 tabular-nums">{fmtKrw(totals.totalMargin)}</td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-green-700 tabular-nums">{fmtKrw(totals.a1)}</td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-purple-700 tabular-nums">{fmtKrw(totals.gm)}</td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-orange-700 tabular-nums">{fmtKrw(totals.rs)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── 품목별 상세 ── */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">품목별 마진 현황</h3>
        <span className="text-xs text-gray-400">* 부가세 별도</span>
      </div>
      <ProductTable
        productRows={productRows}
        totals={totals}
        commissionsInPeriod={commissionsInPeriod}
        periodLabel={periodLabel}
      />
    </div>
  )
}
