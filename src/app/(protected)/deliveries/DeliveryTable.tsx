'use client'

import { useMemo } from 'react'
import { deleteDelivery } from './actions'
import { calcMarginFromContract, calcAddlMargin, fmtKrw, fmtNum } from '@/lib/margin'
import type { DeliveryRow } from './types'

export default function DeliveryTable({
  deliveries,
  filterMonth,
  onFilterChange,
  onEdit,
  onDeleted,
}: {
  deliveries: DeliveryRow[]
  filterMonth: string
  onFilterChange: (month: string) => void
  onEdit: (d: DeliveryRow) => void
  onDeleted: (id: string) => void
}) {
  const filtered = useMemo(
    () => deliveries.filter(d => !filterMonth || d.year_month === filterMonth),
    [deliveries, filterMonth]
  )

  const monthTotal = useMemo(() => {
    let total = 0, korea_a1 = 0, geumhwa = 0, raseong = 0
    for (const d of filtered) {
      if (!d.contract) continue
      const m = calcMarginFromContract(d.contract, d.quantity_kg)
      total += m.total_margin; korea_a1 += m.korea_a1; geumhwa += m.geumhwa; raseong += m.raseong
      if (d.addl_quantity_kg && d.addl_margin_per_ton) {
        const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
        total += am.total_margin; korea_a1 += am.korea_a1; geumhwa += am.geumhwa; raseong += am.raseong
      }
    }
    return { total, korea_a1, geumhwa, raseong }
  }, [filtered])

  async function handleDelete(id: string) {
    if (!confirm('이 입고 데이터를 삭제하시겠습니까?')) return
    const result = await deleteDelivery(id)
    if (result.error) { alert('삭제 실패: ' + result.error); return }
    onDeleted(id)
  }

  return (
    <>
      {/* 월 필터 */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600 font-medium">조회 월:</label>
        <input
          type="month" className="input w-auto" value={filterMonth}
          onChange={e => onFilterChange(e.target.value)}
        />
        <span className="text-xs text-gray-400">{filtered.length}건</span>
      </div>

      {/* 월 마진 합계 카드 */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: '총 마진',    value: monthTotal.total,    color: 'text-blue-600' },
            { label: '한국에이원', value: monthTotal.korea_a1, color: 'text-green-600' },
            { label: '금화',       value: monthTotal.geumhwa,  color: 'text-purple-600' },
            { label: '라성',       value: monthTotal.raseong,  color: 'text-orange-600' },
          ].map(c => (
            <div key={c.label} className="card p-3">
              <p className="text-xs text-gray-500">{filterMonth} {c.label}</p>
              <p className={`text-lg font-bold ${c.color}`}>{fmtKrw(c.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* 목록 테이블 */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th">입고 날짜</th>
              <th className="table-th">품목</th>
              <th className="table-th">납품처</th>
              <th className="table-th text-right">물량 (톤)</th>
              <th className="table-th text-right">판매단가</th>
              <th className="table-th text-right">원가단가</th>
              <th className="table-th text-right">기본 마진</th>
              <th className="table-th text-right">추가 배분</th>
              <th className="table-th text-right">합계 마진</th>
              <th className="table-th text-right">한국에이원</th>
              <th className="table-th text-right">금화</th>
              <th className="table-th text-right">라성</th>
              <th className="table-th">메모</th>
              <th className="table-th">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={14} className="table-td text-center text-gray-400 py-10">
                  {filterMonth} 입고 데이터가 없습니다.
                </td>
              </tr>
            )}
            {filtered.map(d => {
              if (!d.contract) return null
              const main = calcMarginFromContract(d.contract, d.quantity_kg)
              const addl = d.addl_quantity_kg && d.addl_margin_per_ton
                ? calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
                : null
              const combinedTotal = main.total_margin + (addl?.total_margin ?? 0)
              const base = Math.floor(combinedTotal / 3)
              const combined = { total: combinedTotal, a1: base, gm: base, rs: combinedTotal - base * 2 }
              const isUsd = d.contract.currency === 'USD'

              return (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="table-td font-mono text-xs whitespace-nowrap">
                    {d.delivery_date
                      ? <>{d.delivery_date}<br /><span className="text-gray-400">{d.year_month}</span></>
                      : d.year_month
                    }
                  </td>
                  <td className="table-td whitespace-nowrap">
                    <span className="font-medium">{d.product?.display_name}</span>
                    {isUsd && <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1 rounded">USD</span>}
                  </td>
                  <td className="table-td text-gray-500 text-xs whitespace-nowrap">{d.product?.buyer}</td>
                  <td className="table-td text-right whitespace-nowrap">
                    {fmtNum(d.quantity_kg / 1000, 3)}
                    {addl && <div className="text-xs text-orange-500">+{fmtNum(d.addl_quantity_kg! / 1000, 3)}</div>}
                  </td>
                  <td className="table-td text-right whitespace-nowrap">
                    {isUsd
                      ? <>{fmtNum(d.contract.sell_price, 2)}<span className="text-gray-400 text-xs">USD</span></>
                      : <>{fmtNum(d.contract.sell_price)}<span className="text-gray-400 text-xs">원</span></>
                    }
                  </td>
                  <td className="table-td text-right whitespace-nowrap">
                    {isUsd
                      ? <>{fmtNum(d.contract.cost_price, 2)}<span className="text-gray-400 text-xs">USD</span></>
                      : <>{fmtNum(d.contract.cost_price)}<span className="text-gray-400 text-xs">원</span></>
                    }
                  </td>
                  <td className="table-td text-right text-blue-600 whitespace-nowrap">{fmtKrw(main.total_margin)}</td>
                  <td className="table-td text-right text-orange-500 whitespace-nowrap">
                    {addl ? fmtKrw(addl.total_margin) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-td text-right font-bold text-blue-700 whitespace-nowrap">{fmtKrw(combined.total)}</td>
                  <td className="table-td text-right text-green-600 whitespace-nowrap">{fmtKrw(combined.a1)}</td>
                  <td className="table-td text-right text-purple-600 whitespace-nowrap">{fmtKrw(combined.gm)}</td>
                  <td className="table-td text-right text-orange-600 whitespace-nowrap">{fmtKrw(combined.rs)}</td>
                  <td className="table-td text-xs text-gray-400 max-w-[80px] truncate">{d.memo}</td>
                  <td className="table-td whitespace-nowrap">
                    <button className="text-xs text-blue-600 hover:underline mr-2" onClick={() => onEdit(d)}>수정</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => handleDelete(d.id)}>삭제</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
