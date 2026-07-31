'use client'

import { useState } from 'react'
import { fmtKrw } from '@/lib/margin'
import { shiftMonths } from '@/lib/date'
import { toMessage } from '@/lib/error'
import { parsePaidAmount, splitShortfall } from '@/lib/depreciation'
import type { InvoiceRow } from '@/lib/invoice-generator'
import { updatePaidDate } from './actions'
import { recordPaymentShortfall } from './depreciation-actions'

/**
 * 지급/입금 처리 — 실입금액을 받아 계산서 총액과의 차액을 감가로 확정한다.
 * 차액이 있으면 사유(감가) 입력을 강제해, 차액이 조용히 사라지는 것을 막는다.
 */
export default function PaymentDialog({
  invoice,
  onClose,
  onDone,
}: {
  invoice: InvoiceRow
  onClose: () => void
  onDone: () => void
}) {
  const total   = Number(invoice.total_amount)
  const isSales = invoice.invoice_type === 'sales'
  const verb    = isSales ? '입금' : '지급'

  const [date, setDate]     = useState(invoice.paid_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(String(invoice.paid_amount ?? total))
  const [recoverYM, setRecoverYM] = useState(
    invoice.delivery_year_month ? shiftMonths(invoice.delivery_year_month, 2) : '',
  )
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = parsePaidAmount(amount.replace(/,/g, ''), total)
  const diff   = parsed.ok ? parsed.diff : 0
  const split  = diff > 0 ? splitShortfall(diff, Number(invoice.vat_amount) > 0) : null
  const canRecord = invoice.product_id !== null && invoice.delivery_year_month !== null

  async function save() {
    setBusy(true); setError(null)
    try {
      if (!parsed.ok) { setError(parsed.error); return }
      const res = diff === 0
        ? await updatePaidDate(invoice.id, date, null)
        : await recordPaymentShortfall({
            invoiceId: invoice.id,
            paidDate: date,
            paidAmount: parsed.amount,
            costDeductYM: recoverYM,
            memo: memo.trim() || null,
          })
      if (res.error) { setError(res.error); return }
      onDone()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const blocked =
    busy || !date || !parsed.ok ||
    (diff > 0 && (!split?.ok || !recoverYM || !canRecord))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onClose}>
      <div className="card w-full max-w-md p-4 bg-white" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-900">{verb} 처리</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {invoice.from_company} → {invoice.to_company}
          {invoice.delivery_year_month && ` · ${parseInt(invoice.delivery_year_month.slice(5, 7))}월분`}
        </p>

        <div className="mt-3 flex items-baseline justify-between rounded bg-gray-50 px-3 py-2">
          <span className="text-xs text-gray-500">현재 계산서 총액</span>
          <span className="text-sm font-bold tabular-nums">{fmtKrw(total)}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{verb}일</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">실{verb}액</label>
            <input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-right tabular-nums" />
          </div>
        </div>

        {!parsed.ok && (
          <p className="mt-2 text-xs text-red-600">{parsed.error}</p>
        )}

        {diff > 0 && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-800">
              차액 {fmtKrw(diff)} — 사유 입력 필수
            </p>
            {split?.ok ? (
              <p className="text-xs text-amber-700 mt-1 tabular-nums">
                공급가액 {fmtKrw(split.supply)} + 부가세 {fmtKrw(split.vat)}
              </p>
            ) : (
              <p className="text-xs text-red-600 mt-1">{split?.error}</p>
            )}

            {!canRecord && (
              <p className="text-xs text-red-600 mt-2">
                품목·납품월이 없는 계산서라 감가로 기록할 수 없습니다. 별도 확인이 필요합니다.
              </p>
            )}

            {split?.ok && canRecord && (
              <div className="mt-2">
                <label className="block text-xs text-amber-800 mb-1">
                  회수할 납품월 — 이 달 매입 계산서에서 차감됩니다
                </label>
                <input type="month" value={recoverYM} onChange={e => setRecoverYM(e.target.value)}
                  className="border border-amber-300 rounded-md px-2 py-1.5 text-sm" />
                <input value={memo} onChange={e => setMemo(e.target.value)}
                  placeholder="메모 (선택)"
                  className="mt-2 w-full border border-amber-300 rounded-md px-2 py-1.5 text-sm" />
                <p className="text-xs text-amber-700 mt-2 leading-snug">
                  저장하면 {isSales ? '이 매출 계산서가 실입금액으로 재생성되고 커미션도 함께 감액됩니다' : '이 계산서가 차감 금액으로 재생성됩니다'}.
                  회수 전까지 상단에 미회수 금액으로 표시되며, 회수월 매입 계산서에서 자동 차감(커미션은 복구)됩니다.
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn-secondary text-xs">취소</button>
          <button onClick={save} disabled={blocked} className="btn-primary text-xs disabled:opacity-40">
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
