'use client'
import { toMessage } from '@/lib/error'

import { useState } from 'react'
import { upsertFxRate, deleteFxRate } from './actions'
import { fmtNum } from '@/lib/margin'
import type { FeSiProduct, FxRateRow } from './types'

// ────────────────────────────────────────────────────────
// FxRateSection — 섹션 1+2: 환율 입력 폼 + 환율 기록 테이블
// ────────────────────────────────────────────────────────
export default function FxRateSection({
  fxRates,
  fesiProducts,
  onRateUpserted,
  onRateDeleted,
}: {
  fxRates: FxRateRow[]
  fesiProducts: FeSiProduct[]
  onRateUpserted: (rate: FxRateRow) => void
  onRateDeleted: (id: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    product_id: fesiProducts[0]?.id ?? '',
    bl_date: '',
    rate: '',
    memo: '',
  })

  async function handleSaveRate() {
    if (!form.product_id) { setError('품목을 선택하세요.'); return }
    if (!form.bl_date)    { setError('BL 날짜를 입력하세요.'); return }
    const rate = parseFloat(form.rate)
    if (!rate || rate <= 0) { setError('환율을 입력하세요.'); return }

    setSaving(true); setError(null)
    try {
      const result = await upsertFxRate({
        product_id: form.product_id,
        bl_date: form.bl_date,
        rate_krw_per_usd: rate,
        memo: form.memo || null,
      })
      if (result.error) throw new Error(result.error)
      if (result.data) {
        onRateUpserted(result.data as FxRateRow)
        setForm(f => ({ ...f, bl_date: '', rate: '', memo: '' }))
      }
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRate(id: string) {
    if (!confirm('이 환율 기록을 삭제하시겠습니까?')) return
    try {
      const result = await deleteFxRate(id)
      if (result.error) throw new Error(result.error)
      onRateDeleted(id)
    } catch (e) {
      setError(toMessage(e))
    }
  }

  const productName = (id: string) => fesiProducts.find(p => p.id === id)?.display_name ?? id

  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
      )}

      {/* 섹션 1: 환율 입력 */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        BL 날짜 기준 환율 입력
      </h3>
      <div className="card p-5 mb-6 border-2 border-blue-200">
        <p className="text-xs text-gray-500 mb-4">
          FeSi 입고 BL 날짜에 해당하는 실제 적용 환율을 입력하세요.
          입력 후 계산서 발행 지시 재생성 시 자동 적용됩니다.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="label">품목 *</label>
            <select className="input" value={form.product_id}
              onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
              {fesiProducts.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">BL 날짜 *</label>
            <input type="date" className="input" value={form.bl_date}
              onChange={e => setForm(f => ({ ...f, bl_date: e.target.value }))} />
          </div>
          <div>
            <label className="label">환율 (원/USD) *</label>
            <div className="relative">
              <input type="number" className="input pr-20" value={form.rate}
                onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                placeholder="예: 1350.00" step="0.01" min="0" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원/USD</span>
            </div>
          </div>
          <div>
            <label className="label">메모 (선택)</label>
            <input className="input" value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              placeholder="예: 입금일 환율" />
          </div>
        </div>
        <button onClick={handleSaveRate} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? '저장 중…' : '환율 등록'}
        </button>
      </div>

      {/* 섹션 2: 환율 기록 */}
      {fxRates.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            환율 기록
          </h3>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-th">품목</th>
                    <th className="table-th">BL 날짜</th>
                    <th className="table-th text-right">환율 (원/USD)</th>
                    <th className="table-th">메모</th>
                    <th className="table-th">등록일</th>
                    <th className="table-th text-center w-16">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {fxRates.map(r => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="table-td font-medium">{productName(r.product_id)}</td>
                      <td className="table-td">{r.bl_date}</td>
                      <td className="table-td text-right tabular-nums font-semibold text-blue-600">
                        {fmtNum(r.rate_krw_per_usd, 2)}
                      </td>
                      <td className="table-td text-gray-500 text-xs">{r.memo ?? '—'}</td>
                      <td className="table-td text-gray-400 text-xs">
                        {new Date(r.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="table-td text-center">
                        <button onClick={() => handleDeleteRate(r.id)}
                          className="text-xs text-red-400 hover:text-red-600">삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
