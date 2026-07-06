'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtKrw } from '@/lib/margin'
import { sumUnsettled } from '@/lib/depreciation'
import { toMessage } from '@/lib/error'
import type { MonthlyDepreciation } from '@/types'
import {
  upsertMonthlyDepreciation,
  deleteMonthlyDepreciation,
  setDepreciationSettled,
} from './depreciation-actions'

export default function DepreciationPanel({
  productId,
  productLabel,
  deps,
  defaultYearMonth,
}: {
  productId: string
  productLabel: string
  deps: MonthlyDepreciation[]
  /** 입력 기본 납품월 — 분탄 offset=1이므로 조회월 −1 */
  defaultYearMonth: string
}) {
  const router = useRouter()
  const [ym, setYm]         = useState(defaultYearMonth)
  const [amount, setAmount] = useState('')
  const [memo, setMemo]     = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const unsettled = sumUnsettled(deps)

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true); setError(null)
    try {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      setAmount(''); setMemo('')
      router.refresh() // 계산서 금액도 서버에서 재생성됨 — 서버 데이터 재조회
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mb-6 p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-gray-900">
          {productLabel} 감가 정산
          <span className="ml-1 font-normal text-xs text-gray-400">— 렘코 미수, 계약 종료 후 일괄 회수</span>
        </h3>
        <p className="text-sm">
          미정산 누계 <span className="font-bold text-red-600 tabular-nums">{fmtKrw(unsettled)}</span>
        </p>
      </div>

      {deps.length > 0 && (
        <table className="w-full text-xs mt-3">
          <tbody>
            {deps.map(d => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="py-2 tabular-nums whitespace-nowrap">{d.year_month} 납품분</td>
                <td className="py-2 text-right tabular-nums font-medium whitespace-nowrap">{fmtKrw(Number(d.amount))}</td>
                <td className="py-2 pl-3 text-gray-400">{d.memo}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  {d.settled_at ? (
                    <span className="text-green-600">
                      정산완료
                      <button disabled={busy} className="text-gray-400 underline ml-2"
                        onClick={() => run(() => setDepreciationSettled(d.id, false))}>취소</button>
                    </span>
                  ) : (
                    <>
                      <button disabled={busy} className="text-blue-600 underline"
                        onClick={() => run(() => setDepreciationSettled(d.id, true))}>정산완료</button>
                      <button disabled={busy} className="text-red-400 underline ml-2"
                        onClick={() => {
                          if (confirm(`${d.year_month} 감가 ${fmtKrw(Number(d.amount))}을(를) 삭제할까요?\n해당 월 계산서가 총액으로 재생성됩니다.`)) {
                            run(() => deleteMonthlyDepreciation(d.id))
                          }
                        }}>삭제</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-end gap-2 mt-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-400 mb-1">납품월</label>
          <input type="month" value={ym} onChange={e => setYm(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">감가 금액(원)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="예: 500000" min="1" step="1"
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-32" />
        </div>
        <div className="flex-1 min-w-[8rem]">
          <label className="block text-xs text-gray-400 mb-1">메모</label>
          <input value={memo} onChange={e => setMemo(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full" />
        </div>
        <button disabled={busy || !amount}
          className="btn-primary text-xs disabled:opacity-40"
          onClick={() => run(() => upsertMonthlyDepreciation({ product_id: productId, year_month: ym, amount, memo }))}>
          {busy ? '저장 중…' : '감가 저장'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        저장 시 해당 납품월의 렘코 매출 계산서가 감가 차감 금액으로 재생성됩니다. 동창 매입·커미션은 총액 유지.
      </p>

      {error && <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
    </div>
  )
}
