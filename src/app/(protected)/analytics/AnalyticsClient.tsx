'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fmtKrw, fmtNum } from '@/lib/margin'
import { getCurrentYearMonth } from '@/lib/date'
import {
  computeMargins, buildProductRows, buildMonthlyData,
  type DeliveryForAnalytics, type CommissionEntry, type AllAnalytics,
} from './analytics-compute'
import MarginBarChart from './MarginBarChart'
import DateControls from './DateControls'
import SummaryCards from './SummaryCards'
import ProductTable from './ProductTable'

export default function AnalyticsClient({
  fromYM,
  toYM,
  mode,
  deliveries,
  commissions,
  precomputed,
}: {
  fromYM: string
  toYM: string
  mode: 'month' | 'range' | 'year'
  deliveries: DeliveryForAnalytics[]
  commissions: CommissionEntry[]
  precomputed: AllAnalytics
}) {
  const router = useRouter()

  // ── 날짜 컨트롤 ──
  const [activeMode, setActiveMode] = useState<'month' | 'range' | 'year'>(mode)
  const [monthVal, setMonthVal] = useState(mode === 'month' ? fromYM : getCurrentYearMonth())
  const [fromVal,  setFromVal]  = useState(fromYM)
  const [toVal,    setToVal]    = useState(toYM)
  const [yearVal,  setYearVal]  = useState(
    mode === 'year' ? fromYM.slice(0, 4) : String(new Date().getFullYear())
  )

  // ── 필터 ──
  const [filterProduct, setFilterProduct] = useState('all')
  const [filterBuyer,   setFilterBuyer]   = useState('all')

  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear()
    return Array.from({ length: thisYear - 2019 + 1 }, (_, i) => 2020 + i)
  }, [])

  const navigate = useCallback(() => {
    if (activeMode === 'month') router.push(`/analytics?month=${monthVal}`)
    if (activeMode === 'range') router.push(`/analytics?from=${fromVal}&to=${toVal}`)
    if (activeMode === 'year')  router.push(`/analytics?year=${yearVal}`)
  }, [activeMode, monthVal, fromVal, toVal, yearVal, router])

  // ── 필터 활성 여부 ──
  const isFiltered = filterProduct !== 'all' || filterBuyer !== 'all'

  // ── 필터 적용 (활성 시에만 deliveries를 재스캔) ──
  const filtered = useMemo(
    () =>
      isFiltered
        ? deliveries.filter(d => {
            if (!d.product) return false
            if (filterProduct !== 'all' && d.product.name  !== filterProduct) return false
            if (filterBuyer   !== 'all' && d.product.buyer !== filterBuyer)   return false
            return true
          })
        : deliveries,
    [deliveries, filterProduct, filterBuyer, isFiltered]
  )

  // ── 집계: 필터 없음 → precomputed, 필터 있음 → 재계산 ──
  const totals      = useMemo(
    () => isFiltered ? computeMargins(filtered, commissions, fromYM, toYM) : precomputed.totals,
    [isFiltered, filtered, commissions, fromYM, toYM, precomputed.totals]
  )
  const productRows = useMemo(
    () => isFiltered ? buildProductRows(filtered, fromYM, toYM) : precomputed.productRows,
    [isFiltered, filtered, fromYM, toYM, precomputed.productRows]
  )
  const monthlyData = useMemo(
    () => isFiltered ? buildMonthlyData(filtered, commissions, fromYM, toYM) : precomputed.monthlyData,
    [isFiltered, filtered, commissions, fromYM, toYM, precomputed.monthlyData]
  )

  // 커미션·품목 목록: 서버 계산값 고정 사용
  const { commissionsInPeriod, availableProducts } = precomputed

  const showChart   = fromYM !== toYM && monthlyData.length > 1
  const periodLabel = fromYM === toYM
    ? `${fromYM}`
    : `${fromYM} ~ ${toYM} (${monthlyData.length}개월)`

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
        filterProduct={filterProduct} setFilterProduct={setFilterProduct}
        filterBuyer={filterBuyer}     setFilterBuyer={setFilterBuyer}
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
