'use client'

import { type Dispatch, type SetStateAction } from 'react'
import { fmtKrw } from '@/lib/margin'
import { EXPENSE_PAYERS, type Expense, type ExpensePayer } from '@/types'
import type { PayerSettlement, Transfer } from './expense-settlement'

const PAYER_FULL_LABELS: Record<ExpensePayer, string> = {
  korea_a1: '(주)한국에이원',
  raseong: '(주)나성',
  geumhwa: '금화',
}

/** 미정산 합계 + 3사 정산(낼/받을) + 업체 간 송금 안내 + 업체별 지불 세부 */
export default function ExpenseSettlementCard({
  unsettledTotal,
  settlement,
  transfers,
  unassignedTotal,
  detailPayer,
  setDetailPayer,
  detailRows,
}: {
  unsettledTotal: number
  settlement: Record<ExpensePayer, PayerSettlement>
  transfers: Transfer[]
  unassignedTotal: number
  detailPayer: ExpensePayer | null
  setDetailPayer: Dispatch<SetStateAction<ExpensePayer | null>>
  detailRows: Expense[]
}) {
  const detailTotal = detailRows.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="card p-4 sm:p-5 mb-6 border-2 border-amber-100 bg-amber-50">
      <p className="text-xs text-gray-500 mb-1">미정산 합계</p>
      <p className="text-2xl font-bold text-amber-700 mb-4">{fmtKrw(unsettledTotal)}</p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center text-sm">
        {EXPENSE_PAYERS.map(p => {
          const s = settlement[p]
          const selected = detailPayer === p
          return (
            <button
              key={p}
              type="button"
              onClick={() => setDetailPayer(prev => (prev === p ? null : p))}
              className={`bg-white rounded-lg p-2 sm:p-3 border text-center transition-colors ${
                selected ? 'border-amber-500 ring-1 ring-amber-400' : 'border-amber-200 hover:border-amber-400'
              }`}
            >
              <p className="text-[10px] sm:text-xs text-gray-500 mb-1 truncate">{PAYER_FULL_LABELS[p]}</p>
              {s.net > 0 ? (
                <>
                  <p className="text-[10px] sm:text-xs text-red-600">낼 금액</p>
                  <p className="font-semibold text-red-600 tabular-nums text-xs sm:text-sm break-all leading-tight">{fmtKrw(s.net)}</p>
                </>
              ) : s.net < 0 ? (
                <>
                  <p className="text-[10px] sm:text-xs text-blue-600">받을 금액</p>
                  <p className="font-semibold text-blue-600 tabular-nums text-xs sm:text-sm break-all leading-tight">{fmtKrw(-s.net)}</p>
                </>
              ) : (
                <p className="font-semibold text-gray-500 tabular-nums text-xs sm:text-sm">0원</p>
              )}
              <p className="text-[10px] text-gray-400 mt-1 leading-tight">
                1/3 부담 {fmtKrw(s.share)}
                <br />
                지불 {fmtKrw(s.paid)}
              </p>
            </button>
          )
        })}
      </div>

      {/* 업체 간 송금 안내 */}
      {(transfers.length > 0 || unassignedTotal > 0) && (
        <div className="mt-3 bg-white rounded-lg border border-amber-200 p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">정산 송금</p>
          {transfers.length === 0 ? (
            <p className="text-xs text-gray-400 py-1 text-center">업체 간 송금할 내역이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {transfers.map((t, idx) => (
                <li key={idx} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="text-gray-700">
                    <span className="font-medium text-red-600">{PAYER_FULL_LABELS[t.from]}</span>
                    <span className="mx-1.5 text-gray-400">→</span>
                    <span className="font-medium text-blue-600">{PAYER_FULL_LABELS[t.to]}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-gray-800">{fmtKrw(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {unassignedTotal > 0 && (
            <p className="text-[11px] text-amber-600 mt-2 pt-2 border-t border-gray-100">
              지불 업체 미지정 {fmtKrw(unassignedTotal)}은 송금 계산에서 제외됩니다. 목록에서 지불 업체를 지정해 주세요.
            </p>
          )}
        </div>
      )}

      {/* 업체별 지불 세부 내역 */}
      {detailPayer && (
        <div className="mt-3 bg-white rounded-lg border border-amber-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">
              {PAYER_FULL_LABELS[detailPayer]} 지불 내역 (미정산)
            </p>
            <button
              type="button"
              onClick={() => setDetailPayer(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              닫기
            </button>
          </div>
          {detailRows.length === 0 ? (
            <p className="text-xs text-gray-400 py-2 text-center">지불한 내역이 없습니다.</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100">
                {detailRows.map(r => (
                  <li key={r.id} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-gray-400 tabular-nums shrink-0 mr-3">{r.date}</span>
                    <span className="text-gray-700 flex-1 truncate text-left">{r.description}</span>
                    <span className="font-semibold tabular-nums text-gray-800 ml-3 shrink-0">{fmtKrw(r.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-200 text-xs">
                <span className="font-semibold text-gray-600">합계</span>
                <span className="font-bold tabular-nums text-gray-900">{fmtKrw(detailTotal)}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
