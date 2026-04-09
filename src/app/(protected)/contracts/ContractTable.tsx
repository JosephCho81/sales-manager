'use client'

import { deleteContract } from './actions'
import { fmtNum } from '@/lib/margin'
import type { Product } from '@/types'
import type { ContractRow } from './types'

const today = new Date().toISOString().slice(0, 10)

function statusBadge(c: ContractRow) {
  if (today >= c.start_date && today <= c.end_date)
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">적용 중</span>
  if (today > c.end_date)
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">종료</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">예정</span>
}

function fesiMarginPerTon(sellUsd: number, costUsd: number, rate: number): number {
  return (sellUsd - costUsd) * rate
}

export default function ContractTable({
  contracts,
  products,
  filterProductId,
  onFilterChange,
  onEdit,
  onDeleted,
}: {
  contracts: ContractRow[]
  products: Product[]
  filterProductId: string
  onFilterChange: (id: string) => void
  onEdit: (c: ContractRow) => void
  onDeleted: (id: string) => void
}) {
  const filtered = filterProductId
    ? contracts.filter(c => c.product_id === filterProductId)
    : contracts

  async function handleDelete(id: string) {
    if (!confirm('이 낙찰 단가를 삭제하시겠습니까?\n연결된 입고 데이터가 있으면 삭제되지 않습니다.')) return
    const result = await deleteContract(id)
    if (result.error) { alert('삭제 실패: ' + result.error); return }
    onDeleted(id)
  }

  return (
    <>
      {/* 필터 */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600 font-medium">품목 필터:</label>
        <select className="input w-auto" value={filterProductId}
          onChange={e => onFilterChange(e.target.value)}>
          <option value="">전체</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.display_name}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{filtered.length}건</span>
      </div>

      {/* 테이블 */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th">품목</th>
              <th className="table-th">낙찰 기간</th>
              <th className="table-th text-right">판매단가</th>
              <th className="table-th text-right">원가단가</th>
              <th className="table-th text-right">참고 환율</th>
              <th className="table-th text-right">마진 단가</th>
              <th className="table-th text-center">상태</th>
              <th className="table-th">메모</th>
              <th className="table-th">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="table-td text-center text-gray-400 py-10">
                  등록된 낙찰 단가가 없습니다.
                </td>
              </tr>
            )}
            {filtered.map(c => {
              const usd = c.currency === 'USD'
              const marginPerTon = usd && c.reference_exchange_rate
                ? fesiMarginPerTon(c.sell_price, c.cost_price, c.reference_exchange_rate)
                : c.sell_price - c.cost_price
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="table-td">
                    <span className="font-medium">{c.product?.display_name}</span>
                    {usd && <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1 rounded">USD</span>}
                  </td>
                  <td className="table-td text-gray-600 whitespace-nowrap">
                    {c.start_date.slice(0, 10)} ~<br />
                    <span className="text-gray-500">{c.end_date.slice(0, 10)}</span>
                  </td>
                  <td className="table-td text-right whitespace-nowrap">
                    {usd ? (
                      <>
                        {fmtNum(c.sell_price, 2)}<span className="text-gray-400 text-xs ml-0.5">USD/톤</span>
                        {c.reference_exchange_rate && (
                          <div className="text-xs text-gray-400">≈ {fmtNum(c.sell_price * c.reference_exchange_rate)}원</div>
                        )}
                      </>
                    ) : (
                      <>{fmtNum(c.sell_price)}<span className="text-gray-400 text-xs ml-0.5">원/톤</span></>
                    )}
                  </td>
                  <td className="table-td text-right whitespace-nowrap">
                    {usd ? (
                      <>
                        {fmtNum(c.cost_price, 2)}<span className="text-gray-400 text-xs ml-0.5">USD/톤</span>
                        {c.reference_exchange_rate && (
                          <div className="text-xs text-gray-400">≈ {fmtNum(c.cost_price * c.reference_exchange_rate)}원</div>
                        )}
                      </>
                    ) : (
                      <>{fmtNum(c.cost_price)}<span className="text-gray-400 text-xs ml-0.5">원/톤</span></>
                    )}
                  </td>
                  <td className="table-td text-right text-gray-500">
                    {usd && c.reference_exchange_rate
                      ? <>{fmtNum(c.reference_exchange_rate)}<span className="text-xs ml-0.5">원</span></>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`table-td text-right font-semibold whitespace-nowrap ${marginPerTon >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {fmtNum(marginPerTon)}<span className="text-xs font-normal ml-0.5">원/톤</span>
                    {usd && !c.reference_exchange_rate && (
                      <div className="text-xs text-yellow-600 font-normal">환율 필요</div>
                    )}
                  </td>
                  <td className="table-td text-center">{statusBadge(c)}</td>
                  <td className="table-td text-xs text-gray-400 max-w-[120px] truncate">{c.memo ?? '—'}</td>
                  <td className="table-td whitespace-nowrap">
                    <button className="text-xs text-blue-600 hover:underline mr-2" onClick={() => onEdit(c)}>수정</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => handleDelete(c.id)}>삭제</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="mt-3 flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> 적용 중: 오늘이 낙찰 기간 내
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> 예정: 낙찰 기간 시작 전
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> 종료: 낙찰 기간 만료
        </span>
      </div>
    </>
  )
}
