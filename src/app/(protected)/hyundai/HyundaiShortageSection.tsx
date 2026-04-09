'use client'
import { toMessage } from '@/lib/error'

import { useState, useMemo } from 'react'
import { insertHyundaiTransaction, deleteHyundaiTransaction } from './actions'
import { splitMargin, fmtKrw, fmtNum } from '@/lib/margin'
import { monthEnd } from '@/lib/date'
import type { ShortageEntry, HyundaiInvoiceRow as CommInvoice } from './types'

// ────────────────────────────────────────────────────────
// HyundaiShortageSection
//   섹션 3: 부족분 커미션 입력 폼
//   섹션 4: 커미션 현황 (마진 + 부족분 통합)
// ────────────────────────────────────────────────────────
export default function HyundaiShortageSection({
  yearMonth,
  al30ProductId,
  initialShortage,
  commInvoices,
}: {
  yearMonth: string
  al30ProductId: string | null
  initialShortage: ShortageEntry[]
  commInvoices: CommInvoice[]
}) {
  const [shortageList, setShortageList] = useState<ShortageEntry[]>(initialShortage)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ ym: yearMonth, qty_ton: '', price_per_ton: '', memo: '' })

  // ── 커미션 현황 (마진 + 부족분 통합) ──
  const commissionHistory = useMemo(() => {
    type HistRow = {
      key: string; ym: string; type: 'margin' | 'shortage'
      memo: string; geumhwa: number; raseong: number; total: number; isPaid?: boolean
    }
    const rows: HistRow[] = []

    if (commInvoices.length > 0) {
      const gm = commInvoices.find(i => i.to_company === '금화')
      const rs = commInvoices.find(i => i.to_company === '라성')
      rows.push({
        key: `margin-${yearMonth}`, ym: yearMonth, type: 'margin',
        memo: `${yearMonth} 마진`,
        geumhwa: gm ? Number(gm.supply_amount) : 0,
        raseong: rs ? Number(rs.supply_amount) : 0,
        total: (gm ? Number(gm.total_amount) : 0) + (rs ? Number(rs.total_amount) : 0),
        isPaid: !!(gm?.is_paid && rs?.is_paid),
      })
    }

    for (const s of shortageList) {
      const { geumhwa, raseong } = splitMargin(s.commission_amount)
      rows.push({
        key: s.id, ym: s.year_month, type: 'shortage',
        memo: `${s.year_month} 부족분 커미션`,
        geumhwa, raseong, total: s.commission_amount,
      })
    }

    return rows.sort((a, b) => b.ym.localeCompare(a.ym))
  }, [commInvoices, shortageList, yearMonth])

  async function handleSave() {
    if (!al30ProductId) { setError('AL30 품목 정보가 없습니다.'); return }
    const qty   = parseFloat(form.qty_ton)
    const price = parseFloat(form.price_per_ton)
    if (!form.ym)            { setError('기준 월을 입력하세요.'); return }
    if (!qty   || qty <= 0)  { setError('물량을 입력하세요.'); return }
    if (!price || price <= 0){ setError('화림 통보 단가를 입력하세요.'); return }

    setSaving(true); setError(null)
    try {
      const result = await insertHyundaiTransaction({
        year_month: form.ym,
        invoice_date: monthEnd(form.ym),
        quantity_kg: qty * 1000,
        sell_price: price,
        cost_price: 0,
        commission_amount: Math.round(qty * price),
        commission_type: 'shortage',
        memo: form.memo || `AL30 ${form.ym} 부족분 커미션 — ${fmtNum(qty, 3)}톤 × ${fmtNum(price)}원/톤`,
      })
      if (result.error) throw new Error(result.error)
      if (result.data) {
        setShortageList(prev => [result.data as ShortageEntry, ...prev])
        setForm(f => ({ ...f, qty_ton: '', price_per_ton: '', memo: '' }))
      }
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 부족분 항목을 삭제하시겠습니까?')) return
    try {
      const result = await deleteHyundaiTransaction(id)
      if (result.error) throw new Error(result.error)
      setShortageList(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      setError(toMessage(e))
    }
  }

  const hasShortageRows = commissionHistory.some(r => r.type === 'shortage')

  return (
    <>
      {/* ─── 섹션 3: 부족분 커미션 입력 ─── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        부족분 커미션 입력 <span className="font-normal normal-case text-gray-400">(화림 통보)</span>
      </h3>
      <div className="card p-5 mb-6 border-2 border-yellow-200">
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
        )}
        <p className="text-xs text-gray-500 mb-4">
          현대제철이 AL30을 약정 물량보다 덜 가져갔을 때, 화림이 통보한 물량과 단가를 입력하세요.
          금화/라성에 1/3 배분됩니다.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="label">기준 월 *</label>
            <input type="month" className="input" value={form.ym}
              onChange={e => setForm(f => ({ ...f, ym: e.target.value }))} />
          </div>
          <div>
            <label className="label">부족 물량 (톤) *</label>
            <div className="relative">
              <input type="number" className="input pr-10" value={form.qty_ton}
                onChange={e => setForm(f => ({ ...f, qty_ton: e.target.value }))}
                placeholder="예: 50.000" step="0.001" min="0" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">톤</span>
            </div>
          </div>
          <div>
            <label className="label">화림 단가 (원/톤) *</label>
            <div className="relative">
              <input type="number" className="input pr-14" value={form.price_per_ton}
                onChange={e => setForm(f => ({ ...f, price_per_ton: e.target.value }))}
                placeholder="예: 5000" step="100" min="0" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원/톤</span>
            </div>
          </div>
          <div>
            <label className="label">메모 (선택)</label>
            <input className="input" value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              placeholder="선택 입력" />
          </div>
        </div>
        {form.qty_ton && form.price_per_ton && (
          <div className="mb-3 bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
            <span className="font-semibold text-yellow-800">
              부족분 커미션 총액: {fmtKrw(parseFloat(form.qty_ton) * parseFloat(form.price_per_ton))}
            </span>
            <span className="text-xs text-gray-500 ml-3">
              (금화 {fmtKrw(Math.floor(parseFloat(form.qty_ton) * parseFloat(form.price_per_ton) / 3))} /
              라성 {fmtKrw(parseFloat(form.qty_ton) * parseFloat(form.price_per_ton) - 2 * Math.floor(parseFloat(form.qty_ton) * parseFloat(form.price_per_ton) / 3))})
            </span>
          </div>
        )}
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? '저장 중…' : '부족분 커미션 등록'}
        </button>
      </div>

      {/* ─── 섹션 4: 커미션 현황 ─── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        커미션 현황 (마진 + 부족분)
      </h3>
      {commissionHistory.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-gray-400">커미션 이력 없음</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">연월</th>
                  <th className="table-th w-24">종류</th>
                  <th className="table-th">비고</th>
                  <th className="table-th text-right text-purple-700">금화</th>
                  <th className="table-th text-right text-orange-700">라성</th>
                  <th className="table-th text-right">합계</th>
                  <th className="table-th text-center w-16">상태</th>
                  {hasShortageRows && <th className="table-th text-center w-16">관리</th>}
                </tr>
              </thead>
              <tbody>
                {commissionHistory.map(row => (
                  <tr key={row.key} className={`border-t border-gray-100 hover:bg-gray-50 ${row.type === 'shortage' ? 'bg-yellow-50' : ''}`}>
                    <td className="table-td font-medium">{row.ym}</td>
                    <td className="table-td">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        row.type === 'margin' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {row.type === 'margin' ? '마진' : '부족분'}
                      </span>
                    </td>
                    <td className="table-td text-gray-600 text-xs">{row.memo}</td>
                    <td className="table-td text-right tabular-nums text-purple-600">{fmtKrw(row.geumhwa)}</td>
                    <td className="table-td text-right tabular-nums text-orange-600">{fmtKrw(row.raseong)}</td>
                    <td className="table-td text-right tabular-nums font-semibold">{fmtKrw(row.total)}</td>
                    <td className="table-td text-center text-xs">
                      {row.type === 'margin'
                        ? (row.isPaid ? <span className="text-green-500">✓</span> : <span className="text-yellow-500">미지급</span>)
                        : <span className="text-gray-400">수동</span>}
                    </td>
                    {hasShortageRows && (
                      <td className="table-td text-center">
                        {row.type === 'shortage' && (
                          <button onClick={() => handleDelete(row.key)}
                            className="text-xs text-red-400 hover:text-red-600">삭제</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
