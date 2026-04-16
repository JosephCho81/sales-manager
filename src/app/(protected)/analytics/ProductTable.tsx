import React from 'react'
import { fmtNum } from '@/lib/margin'
import { shiftMonths } from '@/lib/date'
import type { MarginTotals, ProductRow, CommissionsInPeriod } from './analytics-compute'

export default function ProductTable({
  productRows,
  totals,
  commissionsInPeriod,
  periodLabel,
}: {
  productRows: ProductRow[]
  totals: MarginTotals
  commissionsInPeriod: CommissionsInPeriod
  periodLabel: string
}) {
  if (productRows.length === 0) {
    return (
      <div className="card px-4 py-8 text-center text-sm text-gray-400">
        조회 기간({periodLabel})에 해당하는 입고 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div className="card overflow-hidden [&_.table-th]:py-3.5 [&_.table-th]:px-2 [&_.table-th]:text-xs [&_.table-th]:whitespace-nowrap [&_.table-th]:text-center [&_.table-td]:py-3.5 [&_.table-td]:px-2">
      <div className="px-2 pt-3 pb-1 text-right text-xs text-gray-400">*부가세 별도 (원/톤, 원)</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="table-th">품목</th>
              <th className="table-th">입고일</th>
              <th className="table-th">납품처</th>
              <th className="table-th">물량(톤)</th>
              <th className="table-th">매출단가</th>
              <th className="table-th">매입단가</th>
              <th className="table-th">매출</th>
              <th className="table-th">매입</th>
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
              const bm     = commissionsInPeriod.byMonth[row.deliveryYearMonth]
              // 현대제철 AL30 커미션 year_month = 납품월 +1 (= 조회월 M-1)
              const bmNext = commissionsInPeriod.byMonth[shiftMonths(row.deliveryYearMonth, +1)]
              const dongkukComm = isAL35 ? (bm?.dongkuk ?? null) : null
              const hyundaiComm = isAL30 ? (bmNext?.hyundai ?? null) : null
              const monthLabel      = row.deliveryYearMonth.slice(5, 7).replace(/^0/, '') + '월분'
              const hyundaiCommLabel = shiftMonths(row.deliveryYearMonth, +1).slice(5, 7).replace(/^0/, '') + '월분'

              return (
                <React.Fragment key={`${row.productId}_${row.deliveryYearMonth}`}>
                  <tr className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="table-td font-medium">{row.displayName}</td>
                    <td className="table-td text-blue-600 tabular-nums whitespace-nowrap">
                      {row.deliveryYearMonth.slice(5, 7).replace(/^0/, '')}월분
                    </td>
                    <td className="table-td text-gray-500">{row.buyer}</td>
                    <td className="table-td text-right tabular-nums whitespace-nowrap">{fmtNum(row.qtyTon, 3)}</td>
                    <td className="table-td text-right tabular-nums whitespace-nowrap">
                      {row.sellPricePerTon !== null ? fmtNum(row.sellPricePerTon, 0) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-td text-right tabular-nums whitespace-nowrap text-gray-600">
                      {row.costPricePerTon !== null ? fmtNum(row.costPricePerTon, 0) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-td text-right tabular-nums whitespace-nowrap">{fmtNum(row.sellKrw, 0)}</td>
                    <td className="table-td text-right tabular-nums whitespace-nowrap text-gray-600">{fmtNum(row.costKrw, 0)}</td>
                    <td className="table-td text-right tabular-nums whitespace-nowrap font-semibold text-blue-600">{fmtNum(row.totalMargin, 0)}</td>
                    <td className="table-td text-right tabular-nums whitespace-nowrap text-green-600">{fmtNum(row.a1, 0)}</td>
                    <td className="table-td text-right tabular-nums whitespace-nowrap text-purple-600">{fmtNum(row.gm, 0)}</td>
                    <td className="table-td text-right tabular-nums whitespace-nowrap text-orange-600">{fmtNum(row.rs, 0)}</td>
                  </tr>
                  {/* AL35B 행 바로 아래 → 해당 납품월 동국제강 커미션 */}
                  {dongkukComm && (
                    <tr className="border-t border-amber-200 bg-amber-50 hover:bg-amber-100">
                      <td className="table-td font-medium text-amber-800 whitespace-nowrap">└ 커미션</td>
                      <td className="table-td text-blue-600 tabular-nums whitespace-nowrap">{monthLabel}</td>
                      <td className="table-td text-amber-600 whitespace-nowrap">동국제강</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap">{fmtNum(dongkukComm.qtyTon, 3)}</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap">
                        {dongkukComm.pricePerTon !== null
                          ? fmtNum(dongkukComm.pricePerTon, 0)
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="table-td text-right text-gray-300">—</td>
                      <td className="table-td text-right text-gray-300">—</td>
                      <td className="table-td text-right text-gray-300">—</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap font-semibold text-amber-700">{fmtNum(dongkukComm.total, 0)}</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap text-green-600">{fmtNum(dongkukComm.a1, 0)}</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap text-purple-600">{fmtNum(dongkukComm.gm, 0)}</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap text-orange-600">{fmtNum(dongkukComm.rs, 0)}</td>
                    </tr>
                  )}
                  {/* AL30 행 바로 아래 → 해당 납품월 현대제철 커미션 */}
                  {hyundaiComm && (
                    <tr className="border-t border-amber-200 bg-amber-50 hover:bg-amber-100">
                      <td className="table-td font-medium text-amber-800 whitespace-nowrap">└ 커미션</td>
                      <td className="table-td text-blue-600 tabular-nums whitespace-nowrap">{hyundaiCommLabel}</td>
                      <td className="table-td text-amber-600 whitespace-nowrap">현대제철</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap">{fmtNum(hyundaiComm.qtyTon, 3)}</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap">
                        {hyundaiComm.pricePerTon !== null
                          ? fmtNum(hyundaiComm.pricePerTon, 0)
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="table-td text-right text-gray-300">—</td>
                      <td className="table-td text-right text-gray-300">—</td>
                      <td className="table-td text-right text-gray-300">—</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap font-semibold text-amber-700">{fmtNum(hyundaiComm.total, 0)}</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap text-green-600">{fmtNum(hyundaiComm.a1, 0)}</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap text-purple-600">{fmtNum(hyundaiComm.gm, 0)}</td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap text-orange-600">{fmtNum(hyundaiComm.rs, 0)}</td>
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
                <td className="px-2 py-3.5 text-right text-sm text-gray-300">—</td>
                <td className="px-2 py-3.5 text-right text-sm text-gray-300">—</td>
                <td className="px-2 py-3.5 text-right text-sm tabular-nums whitespace-nowrap">{fmtNum(totals.sellKrw, 0)}</td>
                <td className="px-2 py-3.5 text-right text-sm tabular-nums whitespace-nowrap text-gray-600">{fmtNum(totals.costKrw, 0)}</td>
                <td className="px-2 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap text-blue-700">{fmtNum(totals.totalMargin, 0)}</td>
                <td className="px-2 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap text-green-700">{fmtNum(totals.a1, 0)}</td>
                <td className="px-2 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap text-purple-700">{fmtNum(totals.gm, 0)}</td>
                <td className="px-2 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap text-orange-700">{fmtNum(totals.rs, 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
