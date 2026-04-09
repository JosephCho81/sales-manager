'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fmtKrw, fmtNum } from '@/lib/margin'
import { getCurrentYearMonth } from '@/lib/date'
import {
  computeMargins, buildProductRows, buildMonthlyData, PRODUCT_ORDER,
  type DeliveryForAnalytics,
} from './analytics-compute'
import MarginBarChart from './MarginBarChart'

// ─────────────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────
export default function AnalyticsClient({
  fromYM,
  toYM,
  mode,
  deliveries,
}: {
  fromYM: string
  toYM: string
  mode: 'month' | 'range' | 'year'
  deliveries: DeliveryForAnalytics[]
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

  // 사용 가능한 품목 목록
  const availableProducts = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of deliveries) {
      if (d.product && !seen.has(d.product.name)) seen.set(d.product.name, d.product.display_name)
    }
    return Array.from(seen.entries()).sort(
      (a, b) => (PRODUCT_ORDER.indexOf(a[0]) < 0 ? 99 : PRODUCT_ORDER.indexOf(a[0])) -
                (PRODUCT_ORDER.indexOf(b[0]) < 0 ? 99 : PRODUCT_ORDER.indexOf(b[0]))
    )
  }, [deliveries])

  // 연도 목록 (2020 ~ 현재+1)
  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear()
    return Array.from({ length: thisYear - 2019 + 1 }, (_, i) => 2020 + i)
  }, [])

  // 조회 버튼
  const navigate = useCallback(() => {
    if (activeMode === 'month') router.push(`/analytics?month=${monthVal}`)
    if (activeMode === 'range') router.push(`/analytics?from=${fromVal}&to=${toVal}`)
    if (activeMode === 'year')  router.push(`/analytics?year=${yearVal}`)
  }, [activeMode, monthVal, fromVal, toVal, yearVal, router])

  // ── 필터 적용 ──
  const filtered = useMemo(
    () =>
      deliveries.filter(d => {
        if (!d.product) return false
        if (filterProduct !== 'all' && d.product.name !== filterProduct) return false
        if (filterBuyer   !== 'all' && d.product.buyer !== filterBuyer)  return false
        return true
      }),
    [deliveries, filterProduct, filterBuyer]
  )

  // ── 집계 ──
  const totals      = useMemo(() => computeMargins(filtered),                       [filtered])
  const productRows = useMemo(() => buildProductRows(filtered),                      [filtered])
  const monthlyData = useMemo(() => buildMonthlyData(filtered, fromYM, toYM),       [filtered, fromYM, toYM])
  const showChart   = fromYM !== toYM && monthlyData.length > 1

  // ── 기간 라벨 ──
  const periodLabel = fromYM === toYM
    ? `${fromYM}`
    : `${fromYM} ~ ${toYM} (${monthlyData.length}개월)`

  // ─────────────────────────────────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── 헤더 ── */}
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900">매출·마진 현황</h2>
        <p className="text-sm text-gray-500 mt-0.5">기간별 3사 매출 및 마진 분석</p>
      </div>

      {/* ── 조회 컨트롤 ── */}
      <div className="card p-4 mb-6">
        {/* 모드 탭 */}
        <div className="flex gap-1 mb-4">
          {([
            { key: 'month', label: '단일월' },
            { key: 'range', label: '기간' },
            { key: 'year',  label: '연도' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveMode(key)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                activeMode === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 날짜 입력 + 조회 + 필터 */}
        <div className="flex items-end gap-2 flex-wrap">
          {activeMode === 'month' && (
            <input
              type="month"
              value={monthVal}
              onChange={e => setMonthVal(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          {activeMode === 'range' && (
            <>
              <input
                type="month"
                value={fromVal}
                onChange={e => setFromVal(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-400 text-sm pb-0.5">~</span>
              <input
                type="month"
                value={toVal}
                onChange={e => setToVal(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </>
          )}
          {activeMode === 'year' && (
            <select
              value={yearVal}
              onChange={e => setYearVal(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          )}
          <button
            onClick={navigate}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 font-medium"
          >
            조회
          </button>

          {/* 필터 */}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <select
              value={filterProduct}
              onChange={e => setFilterProduct(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">전체 품목</option>
              {availableProducts.map(([name, display]) => (
                <option key={name} value={name}>{display}</option>
              ))}
            </select>
            <select
              value={filterBuyer}
              onChange={e => setFilterBuyer(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">전체 납품처</option>
              <option value="동국제강">동국제강</option>
              <option value="현대제철">현대제철</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 기간 라벨 ── */}
      <p className="text-xs text-gray-500 mb-5">
        📅 조회 기간: <span className="font-medium text-gray-700">{periodLabel}</span>
        {(filterProduct !== 'all' || filterBuyer !== 'all') && (
          <span className="ml-2 text-blue-600">
            {filterProduct !== 'all' && `[${availableProducts.find(([n]) => n === filterProduct)?.[1] ?? filterProduct}]`}
            {filterBuyer !== 'all' && ` [${filterBuyer}]`}
          </span>
        )}
      </p>

      {/* ── 3사 요약 카드 ── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">3사 배분 현황</h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* 한국에이원 */}
        <div className="card p-5">
          <div className="text-xs font-bold text-green-700 uppercase tracking-wider mb-4">한국에이원</div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">매출 (동국/현대)</span>
              <span className="text-sm tabular-nums font-medium">{fmtKrw(totals.sellKrw)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">원가 (화림 등)</span>
              <span className="text-sm tabular-nums text-gray-600">{fmtKrw(totals.costKrw)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">총 마진</span>
              <span className="text-sm tabular-nums font-semibold text-blue-600">{fmtKrw(totals.totalMargin)}</span>
            </div>
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between items-center">
            <span className="text-xs text-gray-500">배분 마진 (1/3)</span>
            <span className="text-xl font-bold text-green-600">{fmtKrw(totals.a1)}</span>
          </div>
          {totals.totalMargin > 0 && (
            <div className="text-xs text-gray-400 text-right mt-0.5">
              마진율 {fmtNum(totals.totalMargin / totals.sellKrw * 100, 1)}%
            </div>
          )}
        </div>

        {/* 금화 */}
        <div className="card p-5">
          <div className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-4">금화</div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">배분 마진 (1/3)</span>
              <span className="text-sm tabular-nums font-medium text-gray-800">{fmtKrw(totals.gm)}</span>
            </div>
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between items-center">
            <span className="text-xs text-gray-500">커미션 수취</span>
            <span className="text-xl font-bold text-purple-600">{fmtKrw(totals.gm)}</span>
          </div>
          {totals.totalMargin > 0 && (
            <div className="text-xs text-gray-400 text-right mt-0.5">
              총마진의 {fmtNum(totals.gm / totals.totalMargin * 100, 1)}%
            </div>
          )}
        </div>

        {/* 라성 */}
        <div className="card p-5">
          <div className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-4">라성</div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">배분 마진 (1/3+α)</span>
              <span className="text-sm tabular-nums font-medium text-gray-800">{fmtKrw(totals.rs)}</span>
            </div>
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between items-center">
            <span className="text-xs text-gray-500">커미션 수취</span>
            <span className="text-xl font-bold text-orange-600">{fmtKrw(totals.rs)}</span>
          </div>
          {totals.totalMargin > 0 && (
            <div className="text-xs text-gray-400 text-right mt-0.5">
              총마진의 {fmtNum(totals.rs / totals.totalMargin * 100, 1)}%
            </div>
          )}
        </div>
      </div>

      {/* ── 월별 마진 추이 차트 ── */}
      {showChart && (
        <>
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            월별 마진 추이
          </h3>
          <div className="card p-5 mb-8">
            <MarginBarChart data={monthlyData} />

            {/* 월별 수치 테이블 */}
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
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">품목별 마진 현황</h3>
      {productRows.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-gray-400">
          조회 기간({periodLabel})에 해당하는 입고 데이터가 없습니다.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">품목</th>
                  <th className="table-th">납품처</th>
                  <th className="table-th text-right">물량(톤)</th>
                  <th className="table-th text-right">매출</th>
                  <th className="table-th text-right">원가</th>
                  <th className="table-th text-right">총마진</th>
                  <th className="table-th text-right text-green-700">한국에이원</th>
                  <th className="table-th text-right text-purple-700">금화</th>
                  <th className="table-th text-right text-orange-700">라성</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map(row => (
                  <tr key={row.productId} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="table-td font-medium">{row.displayName}</td>
                    <td className="table-td text-gray-500 text-xs">{row.buyer}</td>
                    <td className="table-td text-right tabular-nums">{fmtNum(row.qtyTon, 3)}</td>
                    <td className="table-td text-right tabular-nums">{fmtKrw(row.sellKrw)}</td>
                    <td className="table-td text-right tabular-nums text-gray-600">{fmtKrw(row.costKrw)}</td>
                    <td className="table-td text-right tabular-nums font-semibold text-blue-600">{fmtKrw(row.totalMargin)}</td>
                    <td className="table-td text-right tabular-nums text-green-600">{fmtKrw(row.a1)}</td>
                    <td className="table-td text-right tabular-nums text-purple-600">{fmtKrw(row.gm)}</td>
                    <td className="table-td text-right tabular-nums text-orange-600">{fmtKrw(row.rs)}</td>
                  </tr>
                ))}
              </tbody>
              {productRows.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td colSpan={2} className="px-4 py-2.5 text-sm">합계</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums">{fmtNum(totals.qtyTon, 3)}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums">{fmtKrw(totals.sellKrw)}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-600">{fmtKrw(totals.costKrw)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-blue-700 tabular-nums">{fmtKrw(totals.totalMargin)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-green-700 tabular-nums">{fmtKrw(totals.a1)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-purple-700 tabular-nums">{fmtKrw(totals.gm)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-orange-700 tabular-nums">{fmtKrw(totals.rs)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
