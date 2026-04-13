'use client'

import { useState, useMemo } from 'react'
import { toMessage } from '@/lib/error'
import { splitMargin, fmtKrw, fmtNum } from '@/lib/margin'
import { monthEnd, getCurrentYearMonth } from '@/lib/date'
import { insertCommission, deleteCommission } from './actions'
import type { CommissionRow } from './types'

// ────────────────────────────────────────────────────────
// 섹션 컴포넌트 (동국제강 / 현대제철 공용)
// ────────────────────────────────────────────────────────
function CommissionSection({
  company,
  rows,
  onInserted,
  onDeleted,
}: {
  company: '동국제강' | '현대제철'
  rows: CommissionRow[]
  onInserted: (row: CommissionRow) => void
  onDeleted: (id: string) => void
}) {
  const [form, setForm] = useState({ ym: getCurrentYearMonth(), qty_ton: '', price_per_ton: '', memo: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // tfoot 합계: rows를 한 번만 순회 (이전: splitMargin을 3×N번 호출)
  const rowTotals = useMemo(() => {
    let total = 0, a1 = 0, gm = 0, rs = 0
    for (const r of rows) {
      const sp = splitMargin(r.commission_amount)
      total += r.commission_amount
      a1    += sp.korea_a1
      gm    += sp.geumhwa
      rs    += sp.raseong
    }
    return { total, a1, gm, rs }
  }, [rows])

  const preview = useMemo(() => {
    const qty = parseFloat(form.qty_ton)
    const price = parseFloat(form.price_per_ton)
    if (!qty || qty <= 0 || !price || price <= 0) return null
    const total = Math.round(qty * price)
    const sp = splitMargin(total)
    return { total, ...sp }
  }, [form.qty_ton, form.price_per_ton])

  async function handleSave() {
    const qty = parseFloat(form.qty_ton)
    const price = parseFloat(form.price_per_ton)
    if (!form.ym)           { setError('기준 월을 입력하세요.'); return }
    if (!qty || qty <= 0)   { setError('물량을 입력하세요.'); return }
    if (!price || price <= 0) { setError('화림 단가를 입력하세요.'); return }

    setSaving(true); setError(null)
    try {
      const result = await insertCommission({
        year_month: form.ym,
        company,
        quantity_kg: qty * 1000,
        price_per_ton: price,
        commission_amount: Math.round(qty * price),
        memo: form.memo || `${company} ${form.ym} 커미션 — ${fmtNum(qty, 3)}톤 × ${fmtNum(price)}원/톤`,
      })
      if (result.error) throw new Error(result.error)
      if (result.data) {
        onInserted(result.data as CommissionRow)
        setForm(f => ({ ...f, qty_ton: '', price_per_ton: '', memo: '' }))
      }
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 커미션 항목을 삭제하시겠습니까?')) return
    try {
      const result = await deleteCommission(id)
      if (result.error) throw new Error(result.error)
      onDeleted(id)
    } catch (e) {
      setError(toMessage(e))
    }
  }

  return (
    <div className="mb-8">
      <h3 className="text-base font-bold text-gray-800 mb-4">{company}</h3>

      {/* 입력 폼 */}
      <div className="card p-5 mb-4 border-2 border-blue-100">
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
        )}
        <p className="text-xs text-gray-500 mb-4">
          월 마감 후 화림이 통보한 커미션 물량과 단가를 입력하세요. 한국에이원 수령 후 라성·금화에 1/3 배분됩니다.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="label">기준 월 *</label>
            <input type="month" className="input" value={form.ym}
              onChange={e => setForm(f => ({ ...f, ym: e.target.value }))} />
          </div>
          <div>
            <label className="label">물량 (톤) *</label>
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
                placeholder="예: 75000" step="100" min="0" />
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

        {preview && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded p-3 text-sm">
            <span className="font-semibold text-blue-800">커미션 총액: {fmtKrw(preview.total)}</span>
            <span className="text-xs text-gray-500 ml-3">
              한국에이원 {fmtKrw(preview.korea_a1)} / 금화 {fmtKrw(preview.geumhwa)} / 라성 {fmtKrw(preview.raseong)}
            </span>
          </div>
        )}

        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? '저장 중…' : '커미션 등록'}
        </button>
      </div>

      {/* 이력 테이블 */}
      {rows.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-gray-400">등록된 커미션 이력이 없습니다.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">기준 월</th>
                  <th className="table-th text-right">물량(톤)</th>
                  <th className="table-th text-right">단가(원/톤)</th>
                  <th className="table-th text-right font-semibold">커미션 총액</th>
                  <th className="table-th text-right text-green-700">한국에이원</th>
                  <th className="table-th text-right text-purple-700">금화</th>
                  <th className="table-th text-right text-orange-700">라성</th>
                  <th className="table-th">메모</th>
                  <th className="table-th text-center whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const sp = splitMargin(row.commission_amount)
                  return (
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="table-td font-medium">{row.year_month}</td>
                      <td className="table-td text-right tabular-nums">{fmtNum(row.quantity_kg / 1000, 3)}</td>
                      <td className="table-td text-right tabular-nums">{fmtNum(row.price_per_ton)}</td>
                      <td className="table-td text-right tabular-nums font-semibold text-blue-700">{fmtKrw(row.commission_amount)}</td>
                      <td className="table-td text-right tabular-nums text-green-600">{fmtKrw(sp.korea_a1)}</td>
                      <td className="table-td text-right tabular-nums text-purple-600">{fmtKrw(sp.geumhwa)}</td>
                      <td className="table-td text-right tabular-nums text-orange-600">{fmtKrw(sp.raseong)}</td>
                      <td className="table-td text-xs text-gray-400 max-w-xs truncate">{row.memo ?? ''}</td>
                      <td className="table-td text-center whitespace-nowrap">
                        <button onClick={() => handleDelete(row.id)}
                          className="text-xs text-red-400 hover:text-red-600">삭제</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {rows.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-sm">
                    <td className="px-4 py-2" colSpan={3}>합계</td>
                    <td className="px-4 py-2 text-right tabular-nums text-blue-700">{fmtKrw(rowTotals.total)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-green-600">{fmtKrw(rowTotals.a1)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-purple-600">{fmtKrw(rowTotals.gm)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-orange-600">{fmtKrw(rowTotals.rs)}</td>
                    <td colSpan={2} />
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

// ────────────────────────────────────────────────────────
// 메인 클라이언트 컴포넌트
// ────────────────────────────────────────────────────────
export default function CommissionClient({ initialRows }: { initialRows: CommissionRow[] }) {
  const [rows, setRows] = useState<CommissionRow[]>(initialRows)

  const [dongkukRows, hyundaiRows] = useMemo(() => [
    rows.filter(r => r.company === '동국제강').sort((a, b) => b.year_month.localeCompare(a.year_month)),
    rows.filter(r => r.company === '현대제철').sort((a, b) => b.year_month.localeCompare(a.year_month)),
  ], [rows])

  function handleInserted(row: CommissionRow) {
    setRows(prev => [row, ...prev])
  }

  function handleDeleted(id: string) {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">커미션 관리</h2>
        <p className="text-sm text-gray-500 mt-0.5">월 마감 후 화림 통보 커미션 입력 · 1/3 배분</p>
      </div>

      <CommissionSection
        company="동국제강"
        rows={dongkukRows}
        onInserted={handleInserted}
        onDeleted={handleDeleted}
      />

      <div className="border-t border-gray-200 my-2" />

      <CommissionSection
        company="현대제철"
        rows={hyundaiRows}
        onInserted={handleInserted}
        onDeleted={handleDeleted}
      />
    </div>
  )
}
