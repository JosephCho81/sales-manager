'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fmtKrw, fmtNum, splitMargin } from '@/lib/margin'
import { getCurrentYearMonth, shiftMonths } from '@/lib/date'
import {
  computeMargins, buildProductRows, buildMonthlyData, PRODUCT_ORDER,
  type DeliveryForAnalytics, type CommissionEntry,
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
  commissions,
}: {
  fromYM: string
  toYM: string
  mode: 'month' | 'range' | 'year'
  deliveries: DeliveryForAnalytics[]
  commissions: CommissionEntry[]
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
  const totals      = useMemo(() => computeMargins(filtered, commissions, fromYM, toYM),        [filtered, commissions, fromYM, toYM])
  const productRows = useMemo(() => buildProductRows(filtered, fromYM, toYM),                   [filtered, fromYM, toYM])
  const monthlyData = useMemo(() => buildMonthlyData(filtered, commissions, fromYM, toYM),      [filtered, commissions, fromYM, toYM])

  // ── 조회 기간 내 커미션 집계 (회사별 분리) ──
  const commissionsInPeriod = useMemo(() => {
    function sumByCompany(company: string) {
      let total = 0, a1 = 0, gm = 0, rs = 0
      for (const c of commissions) {
        const pm = shiftMonths(c.year_month, 1)
        if (pm < fromYM || pm > toYM) continue
        if (c.company !== company) continue
        const sp = splitMargin(c.commission_amount)
        total += c.commission_amount
        a1 += sp.korea_a1; gm += sp.geumhwa; rs += sp.raseong
      }
      return { total, a1, gm, rs }
    }
    const dongkuk = sumByCompany('동국제강')
    const hyundai = sumByCompany('현대제철')
    const all = { total: dongkuk.total + hyundai.total, a1: dongkuk.a1 + hyundai.a1, gm: dongkuk.gm + hyundai.gm, rs: dongkuk.rs + hyundai.rs }
    return { dongkuk, hyundai, all }
  }, [commissions, fromYM, toYM])
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
      <div className="mb-2">
        <h2 className="text-lg font-bold text-gray-900">매출·마진 현황</h2>
      </div>

      {/* ── 조회 컨트롤 ── */}
      <div className="card p-3 mb-3">
        {/* 모드 탭 */}
        <div className="flex gap-1 mb-2">
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
      <p className="text-xs text-gray-500 mb-2">
        📅 조회 기간: <span className="font-medium text-gray-700">{periodLabel}</span>
        {(filterProduct !== 'all' || filterBuyer !== 'all') && (
          <span className="ml-2 text-blue-600">
            {filterProduct !== 'all' && `[${availableProducts.find(([n]) => n === filterProduct)?.[1] ?? filterProduct}]`}
            {filterBuyer !== 'all' && ` [${filterBuyer}]`}
          </span>
        )}
      </p>

      {/* ── 3사 요약 카드 ── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1.5">3사 배분 현황</h3>
      <div className="grid grid-cols-3 gap-3 mb-3 items-stretch">
        {/* 한국에이원 */}
        <div className="card p-3 flex flex-col">
          <div className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">한국에이원</div>
          <div className="space-y-2 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">매출 (동국/현대)</span>
              <span className="text-xs tabular-nums font-medium whitespace-nowrap">{fmtKrw(totals.sellKrw)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">매입 (화림 등)</span>
              <span className="text-xs tabular-nums text-gray-600 whitespace-nowrap">{fmtKrw(totals.costKrw)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">총 마진</span>
              <span className="text-xs tabular-nums font-semibold text-blue-600 whitespace-nowrap">{fmtKrw(totals.totalMargin)}</span>
            </div>
            {totals.totalMargin > 0 && totals.sellKrw > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">마진율</span>
                <span className="text-xs tabular-nums text-gray-400 whitespace-nowrap">{fmtNum(totals.totalMargin / totals.sellKrw * 100, 1)}%</span>
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between items-center">
            <span className="text-xs text-gray-500">한국에이원 마진</span>
            <span className="text-base font-bold text-green-600 whitespace-nowrap">{fmtKrw(totals.a1)}</span>
          </div>
        </div>

        {/* 금화 */}
        <div className="card p-3 flex flex-col">
          <div className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-2">금화</div>
          <div className="space-y-2 flex-1">
            {totals.geumhwaSellKrw > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">매출</span>
                <span className="text-xs tabular-nums font-medium whitespace-nowrap">{fmtKrw(totals.geumhwaSellKrw)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">납품 마진</span>
              <span className="text-xs tabular-nums font-medium text-gray-800 whitespace-nowrap">{fmtKrw(totals.gm - commissionsInPeriod.all.gm)}</span>
            </div>
            {commissionsInPeriod.all.gm > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-amber-600">커미션</span>
                <span className="text-xs tabular-nums font-medium text-amber-700 whitespace-nowrap">{fmtKrw(commissionsInPeriod.all.gm)}</span>
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between items-center">
            <span className="text-xs text-gray-500">금화 마진</span>
            <span className="text-base font-bold text-purple-600 whitespace-nowrap">{fmtKrw(totals.gm)}</span>
          </div>
        </div>

        {/* 라성 */}
        <div className="card p-3 flex flex-col">
          <div className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-2">라성</div>
          <div className="space-y-2 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">납품 마진</span>
              <span className="text-xs tabular-nums font-medium text-gray-800 whitespace-nowrap">{fmtKrw(totals.rs - commissionsInPeriod.all.rs)}</span>
            </div>
            {commissionsInPeriod.all.rs > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-amber-600">커미션</span>
                <span className="text-xs tabular-nums font-medium text-amber-700 whitespace-nowrap">{fmtKrw(commissionsInPeriod.all.rs)}</span>
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between items-center">
            <span className="text-xs text-gray-500">라성 마진</span>
            <span className="text-base font-bold text-orange-600 whitespace-nowrap">{fmtKrw(totals.rs)}</span>
          </div>
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">품목별 마진 현황</h3>
        <span className="text-xs text-gray-400">* 부가세 별도</span>
      </div>
      {productRows.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-gray-400">
          조회 기간({periodLabel})에 해당하는 입고 데이터가 없습니다.
        </div>
      ) : (
        <div className="card overflow-hidden [&_.table-th]:py-3.5 [&_.table-th]:px-2 [&_.table-th]:text-xs [&_.table-th]:whitespace-nowrap [&_.table-th]:text-center [&_.table-td]:py-3.5 [&_.table-td]:px-2">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="table-th">품목</th>
                  <th className="table-th">입고일</th>
                  <th className="table-th">납품처</th>
                  <th className="table-th">물량(톤)</th>
                  <th className="table-th">매출</th>
                  <th className="table-th">원가</th>
                  <th className="table-th">총마진</th>
                  <th className="table-th text-green-700">한국에이원</th>
                  <th className="table-th text-purple-700">금화</th>
                  <th className="table-th text-orange-700">라성</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map(row => {
                  const isAL35 = row.name.toUpperCase() === 'AL35B'
                  const isAL30 = row.name.toUpperCase() === 'AL30'
                  // 이 row가 해당 품목의 마지막 행인지 (같은 name 기준)
                  const sameNameRows = productRows.filter(r => r.name === row.name)
                  const isLastOfName = sameNameRows[sameNameRows.length - 1] === row

                  return (
                    <React.Fragment key={`${row.productId}_${row.deliveryYearMonth}`}>
                      <tr className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="table-td font-medium">{row.displayName}</td>
                        <td className="table-td text-blue-600 tabular-nums whitespace-nowrap">
                          {row.deliveryYearMonth.slice(5, 7).replace(/^0/, '')}월분
                        </td>
                        <td className="table-td text-gray-500">{row.buyer}</td>
                        <td className="table-td text-right tabular-nums whitespace-nowrap">{fmtNum(row.qtyTon, 3)}</td>
                        <td className="table-td text-right tabular-nums whitespace-nowrap">{fmtKrw(row.sellKrw)}</td>
                        <td className="table-td text-right tabular-nums whitespace-nowrap text-gray-600">{fmtKrw(row.costKrw)}</td>
                        <td className="table-td text-right tabular-nums whitespace-nowrap font-semibold text-blue-600">{fmtKrw(row.totalMargin)}</td>
                        <td className="table-td text-right tabular-nums whitespace-nowrap text-green-600">{fmtKrw(row.a1)}</td>
                        <td className="table-td text-right tabular-nums whitespace-nowrap text-purple-600">{fmtKrw(row.gm)}</td>
                        <td className="table-td text-right tabular-nums whitespace-nowrap text-orange-600">{fmtKrw(row.rs)}</td>
                      </tr>
                      {/* AL35B 마지막 행 뒤 → 동국제강 커미션 */}
                      {isAL35 && isLastOfName && commissionsInPeriod.dongkuk.total > 0 && (
                        <tr className="border-t border-amber-200 bg-amber-50 hover:bg-amber-100">
                          <td className="table-td font-medium text-amber-800 whitespace-nowrap">└ 커미션</td>
                          <td className="table-td text-gray-300">—</td>
                          <td className="table-td text-amber-600 whitespace-nowrap">동국제강</td>
                          <td className="table-td text-right text-gray-300">—</td>
                          <td className="table-td text-right text-gray-300">—</td>
                          <td className="table-td text-right text-gray-300">—</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap font-semibold text-amber-700">{fmtKrw(commissionsInPeriod.dongkuk.total)}</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap text-green-600">{fmtKrw(commissionsInPeriod.dongkuk.a1)}</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap text-purple-600">{fmtKrw(commissionsInPeriod.dongkuk.gm)}</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap text-orange-600">{fmtKrw(commissionsInPeriod.dongkuk.rs)}</td>
                        </tr>
                      )}
                      {/* AL30 마지막 행 뒤 → 현대제철 커미션 */}
                      {isAL30 && isLastOfName && commissionsInPeriod.hyundai.total > 0 && (
                        <tr className="border-t border-amber-200 bg-amber-50 hover:bg-amber-100">
                          <td className="table-td font-medium text-amber-800 whitespace-nowrap">└ 커미션</td>
                          <td className="table-td text-gray-300">—</td>
                          <td className="table-td text-amber-600 whitespace-nowrap">현대제철</td>
                          <td className="table-td text-right text-gray-300">—</td>
                          <td className="table-td text-right text-gray-300">—</td>
                          <td className="table-td text-right text-gray-300">—</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap font-semibold text-amber-700">{fmtKrw(commissionsInPeriod.hyundai.total)}</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap text-green-600">{fmtKrw(commissionsInPeriod.hyundai.a1)}</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap text-purple-600">{fmtKrw(commissionsInPeriod.hyundai.gm)}</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap text-orange-600">{fmtKrw(commissionsInPeriod.hyundai.rs)}</td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
              {productRows.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td colSpan={3} className="px-2 py-3.5 text-sm">합계</td>
                    <td className="px-2 py-3.5 text-right text-sm text-gray-300">—</td>
                    <td className="px-2 py-3.5 text-right text-sm tabular-nums whitespace-nowrap">{fmtKrw(totals.sellKrw)}</td>
                    <td className="px-2 py-3.5 text-right text-sm tabular-nums whitespace-nowrap text-gray-600">{fmtKrw(totals.costKrw)}</td>
                    <td className="px-2 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap text-blue-700">{fmtKrw(totals.totalMargin)}</td>
                    <td className="px-2 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap text-green-700">{fmtKrw(totals.a1)}</td>
                    <td className="px-2 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap text-purple-700">{fmtKrw(totals.gm)}</td>
                    <td className="px-2 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap text-orange-700">{fmtKrw(totals.rs)}</td>
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
