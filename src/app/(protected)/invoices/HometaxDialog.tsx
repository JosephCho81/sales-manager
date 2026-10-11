'use client'

import { useState } from 'react'
import { fmtKrw } from '@/lib/margin'
import { toMessage } from '@/lib/error'
import { hometaxIssuers, planHometaxExport, type CompanyInfo } from '@/lib/hometax'
import type { InvoiceRow } from '@/lib/invoice-generator'

/**
 * 홈택스 엑셀 일괄발급 파일 받기. 미리보기는 화면 데이터로 계산하고,
 * 실제 파일은 서버가 DB에서 다시 조회·검증해 만든다(route.ts).
 */
export default function HometaxDialog({
  yearMonth,
  invoices,
  companies,
  companiesError,
  productMap,
  onClose,
}: {
  yearMonth: string
  invoices: InvoiceRow[]
  companies: CompanyInfo[]
  /** 025 미적용 등으로 사업자정보를 못 읽었을 때 */
  companiesError: string | null
  /** product_id → 표시명 (서버와 같은 display_name ?? name) */
  productMap: Map<string, string>
  onClose: () => void
}) {
  const issuers = hometaxIssuers(invoices)
  const [issuer, setIssuer] = useState(issuers.includes('(주)나성') ? '(주)나성' : issuers[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = planHometaxExport({ invoices, issuer, companies, productNames: productMap })
  const errors = companiesError ? [companiesError] : plan.errors

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/invoices/hometax?month=${yearMonth}&issuer=${encodeURIComponent(issuer)}`)
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `홈택스_일괄발급_${issuer.replace(/[()]/g, '')}_${yearMonth}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const sum = plan.rows.reduce((s, r) => ({ supply: s.supply + r.supply, vat: s.vat + r.vat }), { supply: 0, vat: 0 })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-4 bg-white" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-900">홈택스 엑셀 일괄발급 파일</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {yearMonth} 커미션 계산서 · 받은 파일을 홈택스 <b>엑셀 일괄발급</b>에 올리면 됩니다
        </p>

        <div className="mt-3 flex gap-1.5">
          {issuers.map(name => (
            <button key={name}
              onClick={() => setIssuer(name)}
              className={`rounded-md border px-3 py-1.5 text-sm ${issuer === name ? 'border-blue-500 bg-blue-50 font-bold text-blue-700' : 'border-gray-300 text-gray-600'}`}>
              {name} 발행분
            </button>
          ))}
        </div>

        {plan.rows.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="text-left font-normal pb-1">작성일자</th>
                <th className="text-left font-normal pb-1">품목</th>
                <th className="text-right font-normal pb-1">공급가액</th>
                <th className="text-right font-normal pb-1">세액</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {plan.rows.map(r => (
                <tr key={r.invoiceId} className="border-b border-gray-50">
                  <td className="py-1">{r.writeDate.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')}</td>
                  <td className="py-1">{r.item}</td>
                  <td className="py-1 text-right">{fmtKrw(r.supply)}</td>
                  <td className="py-1 text-right">{fmtKrw(r.vat)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="pt-1" colSpan={2}>{plan.rows.length}건 · 합계 {fmtKrw(sum.supply + sum.vat)}</td>
                <td className="pt-1 text-right">{fmtKrw(sum.supply)}</td>
                <td className="pt-1 text-right">{fmtKrw(sum.vat)}</td>
              </tr>
            </tbody>
          </table>
        )}
        {plan.rows.length > 0 && (
          <p className="mt-1 text-xs text-gray-500">
            공급자 {plan.rows[0].supplier.trade_name} → 공급받는자 {plan.rows[0].buyer.trade_name} · 청구
          </p>
        )}

        {plan.skipped.length > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            제외 {plan.skipped.length}건 — 실물 대사(✓)가 끝난 계산서는 이미 발행된 것으로 보고 넣지 않습니다.
          </p>
        )}

        {errors.length > 0 && (
          <ul className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 space-y-0.5">
            {errors.map(e => <li key={e}>{e}</li>)}
          </ul>
        )}
        {error && <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded whitespace-pre-line">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-xs">닫기</button>
          <button onClick={download} disabled={busy || errors.length > 0}
            className="btn-primary text-xs disabled:opacity-40">
            {busy ? '만드는 중…' : '엑셀 파일 받기'}
          </button>
        </div>
      </div>
    </div>
  )
}
