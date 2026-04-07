'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { upsertFxRate, deleteFxRate } from './actions'
import { fmtKrw, fmtNum } from '@/lib/margin'

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────
type FeSiProduct = { id: string; name: string; display_name: string }

type DeliveryRow = {
  id: string
  year_month: string
  delivery_date: string | null
  product_id: string
  quantity_kg: number
  memo: string | null
  product: { id: string; name: string; display_name: string } | null
  contract: {
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
  } | null
}

type FxRateRow = {
  id: string
  bl_date: string
  product_id: string
  rate_krw_per_usd: number
  memo: string | null
  created_at: string
}

// ─────────────────────────────────────────────
// 날짜 유틸
// ─────────────────────────────────────────────
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────
export default function FeSiClient({
  yearMonth,
  fesiProducts,
  initialDeliveries,
  initialFxRates,
}: {
  yearMonth: string
  fesiProducts: FeSiProduct[]
  initialDeliveries: DeliveryRow[]
  initialFxRates: FxRateRow[]
}) {
  const router = useRouter()
  const [fxRates, setFxRates] = useState<FxRateRow[]>(initialFxRates)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 환율 입력 폼
  const [form, setForm] = useState({
    product_id: fesiProducts[0]?.id ?? '',
    bl_date: '',
    rate: '',
    memo: '',
  })

  // ── 환율 맵 (product_id:bl_date → rate) ─────
  const rateMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of fxRates) {
      m.set(`${r.product_id}:${r.bl_date}`, r.rate_krw_per_usd)
    }
    return m
  }, [fxRates])

  // ── 입고별 환율 적용 계산 ─────────────────────
  const deliveryDetails = useMemo(() =>
    initialDeliveries.map(d => {
      const refRate = d.contract?.reference_exchange_rate ?? null
      const actualRate = d.delivery_date
        ? (rateMap.get(`${d.product_id}:${d.delivery_date}`) ?? null)
        : null
      const rate = actualRate ?? refRate ?? 1
      const qtyTon = d.quantity_kg / 1000

      const sellKrw  = d.contract ? d.contract.sell_price * qtyTon : 0
      const costUsd  = d.contract ? d.contract.cost_price * qtyTon : 0
      const costKrw  = costUsd * rate
      const marginKrw = sellKrw - costKrw

      const blDate = d.delivery_date ?? `${d.year_month}-15`
      const receiveDeadline = addDays(blDate, 10)  // 동국 대금 수령 기한
      const egPayDeadline   = addDays(blDate, 15)  // EG 송금 기한

      return {
        ...d,
        refRate,
        actualRate,
        rateUsed: rate,
        rateSource: actualRate ? 'BL기준' : (refRate ? '계약참고' : '미설정'),
        qtyTon,
        sellKrw,
        costUsd,
        costKrw,
        marginKrw,
        blDate,
        receiveDeadline,
        egPayDeadline,
      }
    }), [initialDeliveries, rateMap]
  )

  // ── 환율 저장 ─────────────────────────────────
  async function handleSaveRate() {
    if (!form.product_id) { setError('품목을 선택하세요.'); return }
    if (!form.bl_date)    { setError('BL 날짜를 입력하세요.'); return }
    const rate = parseFloat(form.rate)
    if (!rate || rate <= 0) { setError('환율을 입력하세요.'); return }

    setSaving(true)
    setError(null)
    try {
      const result = await upsertFxRate({
        product_id: form.product_id,
        bl_date: form.bl_date,
        rate_krw_per_usd: rate,
        memo: form.memo || null,
      })
      if (result.error) throw new Error(result.error)
      if (result.data) {
        const data = result.data as FxRateRow
        setFxRates(prev => {
          const key = `${data.product_id}:${data.bl_date}`
          const exists = prev.findIndex(r => `${r.product_id}:${r.bl_date}` === key)
          if (exists >= 0) {
            const next = [...prev]
            next[exists] = data
            return next
          }
          return [data, ...prev]
        })
        setForm(f => ({ ...f, bl_date: '', rate: '', memo: '' }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRate(id: string) {
    if (!confirm('이 환율 기록을 삭제하시겠습니까?')) return
    try {
      const result = await deleteFxRate(id)
      if (result.error) throw new Error(result.error)
      setFxRates(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const productName = (id: string) => fesiProducts.find(p => p.id === id)?.display_name ?? id

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────
  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">페로실리콘 달러 처리</h2>
          <p className="text-sm text-gray-500 mt-0.5">BL 날짜 기준 환율 입력 · 원화 환산 · 지급 일정</p>
        </div>
        <input
          type="month"
          value={yearMonth}
          onChange={e => router.push(`/fesi?month=${e.target.value}`)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
      )}

      {/* ─── 1. 환율 입력 ─── */}
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
            <select
              className="input"
              value={form.product_id}
              onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
            >
              {fesiProducts.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">BL 날짜 *</label>
            <input
              type="date"
              className="input"
              value={form.bl_date}
              onChange={e => setForm(f => ({ ...f, bl_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">환율 (원/USD) *</label>
            <div className="relative">
              <input
                type="number"
                className="input pr-20"
                value={form.rate}
                onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                placeholder="예: 1350.00"
                step="0.01"
                min="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원/USD</span>
            </div>
          </div>
          <div>
            <label className="label">메모 (선택)</label>
            <input
              className="input"
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              placeholder="예: 입금일 환율"
            />
          </div>
        </div>
        <button
          onClick={handleSaveRate}
          disabled={saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? '저장 중…' : '환율 등록'}
        </button>
      </div>

      {/* ─── 2. 환율 기록 목록 ─── */}
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
                        <button
                          onClick={() => handleDeleteRate(r.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── 3. 이번 달 FeSi 입고 및 계산서 일정 ─── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        {yearMonth} 입고별 계산서 일정
      </h3>
      {deliveryDetails.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-gray-400">
          {yearMonth} FeSi 입고 데이터 없음
        </div>
      ) : (
        <div className="space-y-4">
          {deliveryDetails.map(d => (
            <div key={d.id} className="card overflow-hidden">
              {/* 헤더 */}
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex justify-between items-start">
                <div>
                  <span className="text-sm font-semibold text-gray-900">
                    {d.product?.display_name}
                  </span>
                  <span className="ml-3 text-sm text-gray-600">
                    BL 날짜: <strong>{d.blDate}</strong>
                  </span>
                  <span className="ml-3 text-sm text-gray-600">
                    {fmtNum(d.qtyTon, 3)} 톤
                  </span>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    d.rateSource === 'BL기준'
                      ? 'bg-green-100 text-green-700'
                      : d.rateSource === '계약참고'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {d.rateSource}
                  </span>
                  <p className="text-sm font-bold text-blue-700 mt-1">
                    {fmtNum(d.rateUsed, 2)} 원/USD
                    {d.actualRate && d.refRate && d.actualRate !== d.refRate && (
                      <span className="text-xs text-gray-400 ml-1">
                        (참고: {fmtNum(d.refRate, 0)})
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* 계산서 일정 */}
              <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 동국제강 역발행 */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-2">① 동국제강 역발행 (BL 당일)</p>
                  <p className="text-xs text-gray-400">발행기준일</p>
                  <p className="text-sm font-bold text-gray-900">{d.blDate}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">공급가액</span>
                      <span className="font-medium">{fmtKrw(d.sellKrw)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">VAT (10%)</span>
                      <span>{fmtKrw(d.sellKrw * 0.1)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold border-t border-gray-200 pt-1">
                      <span>합계</span>
                      <span className="text-blue-600">{fmtKrw(d.sellKrw * 1.1)}</span>
                    </div>
                  </div>
                </div>

                {/* EG 지급 */}
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-600 mb-2">② EG 지급 (BL +15일)</p>
                  <p className="text-xs text-gray-400">지급 기한</p>
                  <p className="text-sm font-bold text-blue-800">{d.egPayDeadline}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">USD</span>
                      <span className="font-semibold text-blue-700">${fmtNum(d.costUsd, 2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">원화 환산</span>
                      <span className="font-medium">{fmtKrw(d.costKrw)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">VAT</span>
                      <span>{fmtKrw(d.costKrw * 0.1)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold border-t border-blue-200 pt-1">
                      <span>합계 (KRW)</span>
                      <span className="text-blue-700">{fmtKrw(d.costKrw * 1.1)}</span>
                    </div>
                  </div>
                </div>

                {/* 대금 수령 + 마진 */}
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-600 mb-2">③ 동국 대금 수령 (BL +10일)</p>
                  <p className="text-xs text-gray-400">수령 기한</p>
                  <p className="text-sm font-bold text-green-800">{d.receiveDeadline}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">매출 (KRW)</span>
                      <span>{fmtKrw(d.sellKrw)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">원가 (KRW)</span>
                      <span>{fmtKrw(d.costKrw)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold border-t border-green-200 pt-1">
                      <span>순 마진</span>
                      <span className={d.marginKrw >= 0 ? 'text-green-700' : 'text-red-600'}>
                        {fmtKrw(d.marginKrw)}
                      </span>
                    </div>
                  </div>
                  {!d.actualRate && (
                    <p className="mt-2 text-xs text-yellow-600">
                      ⚠ BL 기준 환율 미입력 — 참고 환율 사용 중
                    </p>
                  )}
                </div>
              </div>

              {d.memo && (
                <div className="px-4 pb-3 text-xs text-gray-400">{d.memo}</div>
              )}
            </div>
          ))}

          {/* 월 합계 */}
          <div className="card p-4 bg-gray-50">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">
                  {yearMonth} FeSi 합계
                </p>
                <p className="text-sm text-gray-600">
                  총 {fmtNum(deliveryDetails.reduce((s, d) => s + d.qtyTon, 0), 3)} 톤
                </p>
              </div>
              <div className="grid grid-cols-3 gap-6 text-right">
                <div>
                  <p className="text-xs text-gray-400">매출 (KRW)</p>
                  <p className="text-base font-bold text-gray-900">
                    {fmtKrw(deliveryDetails.reduce((s, d) => s + d.sellKrw, 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-400">원가 (USD)</p>
                  <p className="text-base font-bold text-blue-700">
                    ${fmtNum(deliveryDetails.reduce((s, d) => s + d.costUsd, 0), 2)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {fmtKrw(deliveryDetails.reduce((s, d) => s + d.costKrw, 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-green-500">순 마진</p>
                  <p className="text-base font-bold text-green-700">
                    {fmtKrw(deliveryDetails.reduce((s, d) => s + d.marginKrw, 0))}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
