'use client'

import { useState } from 'react'
import { fmtKrw } from '@/lib/margin'
import { toMessage } from '@/lib/error'
import { parseAmountInput } from '@/lib/reconcile'
import type { InvoiceRow } from '@/lib/invoice-generator'
import { reconcileInvoice, clearReconciliation } from './actions'

/**
 * 실물 세금계산서 대사 — 실제 발행된 공급가액·부가세를 입력해 생성값과 대조한다.
 * 차이는 저장 전에 바로 보여준다. 부가세만 어긋나면 감가 패널의
 * "부가세 실계산서" 칸에 넣어야 할 값이 곧 여기 입력한 부가세다.
 */
export default function ReconcileDialog({
  invoice,
  onClose,
  onDone,
}: {
  invoice: InvoiceRow
  onClose: () => void
  onDone: () => void
}) {
  const genSupply = Number(invoice.supply_amount)
  const genVat    = Number(invoice.vat_amount)
  const genTotal  = Number(invoice.total_amount)

  const [supply, setSupply] = useState(String(invoice.actual_supply_amount ?? genSupply))
  const [vat, setVat]       = useState(String(invoice.actual_vat_amount ?? genVat))
  const [memo, setMemo]     = useState(invoice.reconcile_memo ?? '')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const pSupply = parseAmountInput(supply)
  const pVat    = parseAmountInput(vat)
  const valid   = pSupply.ok && pVat.ok

  const dSupply = valid ? pSupply.value - genSupply : 0
  const dVat    = valid ? pVat.value - genVat : 0
  const dTotal  = dSupply + dVat
  const matched = valid && dSupply === 0 && dVat === 0

  const sign = (n: number) => (n > 0 ? `+${fmtKrw(n)}` : fmtKrw(n))

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true); setError(null)
    try {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      onDone()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-4 bg-white" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-900">실물 계산서 대사</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {invoice.from_company} → {invoice.to_company}
          {invoice.delivery_year_month && ` · ${parseInt(invoice.delivery_year_month.slice(5, 7))}월분`}
        </p>

        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400">
              <th className="text-left font-normal pb-1">항목</th>
              <th className="text-right font-normal pb-1">생성값</th>
              <th className="text-right font-normal pb-1 w-32">실물</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1 text-gray-600">공급가액</td>
              <td className="py-1 text-right tabular-nums text-gray-500">{fmtKrw(genSupply)}</td>
              <td className="py-1">
                <input inputMode="numeric" value={supply} onChange={e => setSupply(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm text-right tabular-nums" />
              </td>
            </tr>
            <tr>
              <td className="py-1 text-gray-600">부가세</td>
              <td className="py-1 text-right tabular-nums text-gray-500">{fmtKrw(genVat)}</td>
              <td className="py-1">
                <input inputMode="numeric" value={vat} onChange={e => setVat(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm text-right tabular-nums" />
              </td>
            </tr>
            <tr className="border-t border-gray-100">
              <td className="pt-1 font-semibold text-gray-700">합계</td>
              <td className="pt-1 text-right tabular-nums font-semibold">{fmtKrw(genTotal)}</td>
              <td className="pt-1 text-right tabular-nums font-semibold">
                {valid ? fmtKrw(pSupply.value + pVat.value) : '—'}
              </td>
            </tr>
          </tbody>
        </table>

        {!pSupply.ok && <p className="mt-2 text-xs text-red-600">공급가액: {pSupply.error}</p>}
        {!pVat.ok && <p className="mt-1 text-xs text-red-600">부가세: {pVat.error}</p>}

        {valid && (
          matched ? (
            <p className="mt-3 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
              실물과 일치
            </p>
          ) : (
            <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2">
              <p className="text-sm font-bold text-red-700 tabular-nums">차이 {sign(dTotal)}</p>
              <p className="mt-0.5 text-xs text-red-600 tabular-nums">
                공급가액 {sign(dSupply)} · 부가세 {sign(dVat)}
              </p>
              {dSupply === 0 && dVat !== 0 && (
                <p className="mt-1.5 text-xs leading-snug text-red-700">
                  공급가액은 맞고 부가세만 다릅니다 — 거래처 절사 관례 차이입니다.
                  감가 반영 매입 계산서라면 감가 패널의 <b>부가세 실계산서</b>에 {fmtKrw(pVat.value)}을(를)
                  넣고 재생성하면 실물과 같아집니다.
                </p>
              )}
            </div>
          )
        )}

        <input value={memo} onChange={e => setMemo(e.target.value)}
          placeholder="메모 (선택) — 예: 동창 실물 세금계산서 대조"
          className="mt-3 w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />

        {error && <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          {invoice.reconciled_at && (
            <button
              onClick={() => run(() => clearReconciliation(invoice.id))}
              disabled={busy}
              className="mr-auto text-xs text-gray-500 underline"
            >
              대사 취소
            </button>
          )}
          <button onClick={onClose} disabled={busy} className="btn-secondary text-xs">닫기</button>
          <button
            onClick={() => run(() => reconcileInvoice({
              invoiceId: invoice.id, actualSupply: supply, actualVat: vat, memo,
            }))}
            disabled={busy || !valid}
            className="btn-primary text-xs disabled:opacity-40"
          >
            {busy ? '저장 중…' : '대사 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
