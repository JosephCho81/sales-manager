'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calcMarginFromContract, calcAddlMargin, splitMargin, fmtKrw, fmtNum } from '@/lib/margin'

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────
type DeliveryRow = {
  id: string
  year_month: string
  delivery_date: string | null
  product_id: string
  quantity_kg: number
  addl_quantity_kg: number | null
  addl_margin_per_ton: number | null
  memo: string | null
  contract: {
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
  } | null
}

type InvoiceRow = {
  id: string
  year_month: string
  from_company: string
  to_company: string
  supply_amount: number
  vat_amount: number
  total_amount: number
  invoice_basis_date: string | null
  payment_due_date: string | null
  is_paid: boolean
  invoice_type: string | null
  memo: string | null
}

type ShortageEntry = {
  id: string
  year_month: string
  quantity_kg: number
  sell_price: number      // 화림 통보 단가 (원/톤)
  commission_amount: number
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

function monthEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).toISOString().slice(0, 10)
}

function nthDay(ym: string, day: number): string {
  return `${ym}-${String(day).padStart(2, '0')}`
}

function shiftMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getPeriodLabel(day: number): string {
  if (day <= 10) return '1~10일'
  if (day <= 20) return '11~20일'
  return '21일~말일'
}

function getPeriodBasisDate(ym: string, day: number): string {
  if (day <= 10) return nthDay(ym, 10)
  if (day <= 20) return nthDay(ym, 20)
  return monthEnd(ym)
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export default function HyundaiClient({
  yearMonth,
  al30ProductId,
  initialDeliveries,
  initialInvoices,
  initialShortage,
}: {
  yearMonth: string
  al30ProductId: string | null
  initialDeliveries: DeliveryRow[]
  initialInvoices: InvoiceRow[]
  initialShortage: ShortageEntry[]
}) {
  const router = useRouter()
  const [shortageList, setShortageList] = useState<ShortageEntry[]>(initialShortage)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 부족분 입력 폼
  const [form, setForm] = useState({
    ym: yearMonth,
    qty_ton: '',
    price_per_ton: '',
    memo: '',
  })

  // ── 10일 단위 그룹화 ──────────────────────────────
  const periods = useMemo(() => {
    const groups: Record<string, DeliveryRow[]> = {
      '1~10일': [],
      '11~20일': [],
      '21일~말일': [],
    }
    for (const d of initialDeliveries) {
      const day = d.delivery_date ? parseInt(d.delivery_date.slice(8, 10)) : 15
      groups[getPeriodLabel(day)].push(d)
    }
    return groups
  }, [initialDeliveries])

  // ── 기간별 집계 ──────────────────────────────────
  const periodSummaries = useMemo(() =>
    (['1~10일', '11~20일', '21일~말일'] as const).map(label => {
      const deliveries = periods[label]
      if (deliveries.length === 0) return { label, deliveries: [], sellTotal: 0, marginTotal: 0 }

      let sellTotal = 0, marginTotal = 0
      const day = label === '1~10일' ? 5 : label === '11~20일' ? 15 : 25
      const basisDate = getPeriodBasisDate(yearMonth, day)
      const billDueDate = addDays(basisDate, 60)

      for (const d of deliveries) {
        if (!d.contract) continue
        const m = calcMarginFromContract(d.contract, d.quantity_kg)
        sellTotal += m.sell_price * m.quantity_ton
        marginTotal += m.total_margin
        if (d.addl_quantity_kg && d.addl_margin_per_ton) {
          const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
          marginTotal += am.total_margin
        }
      }

      return {
        label,
        deliveries,
        sellTotal,
        marginTotal,
        qtyTon: deliveries.reduce((s, d) => s + d.quantity_kg / 1000, 0),
        basisDate,
        billDueDate,
      }
    }), [periods, yearMonth]
  )

  // ── 월 합계 ──────────────────────────────────────
  const monthTotal = useMemo(() => {
    let sell = 0, margin = 0
    for (const d of initialDeliveries) {
      if (!d.contract) continue
      const m = calcMarginFromContract(d.contract, d.quantity_kg)
      sell += m.sell_price * m.quantity_ton
      margin += m.total_margin
      if (d.addl_quantity_kg && d.addl_margin_per_ton) {
        const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
        margin += am.total_margin
      }
    }
    const split = splitMargin(margin)
    return { sell, margin, ...split }
  }, [initialDeliveries])

  // ── 발행 지시 목록 분류 ──────────────────────────
  const salesInvoices = initialInvoices.filter(i => i.invoice_type === 'sales')
  const costInvoice   = initialInvoices.find(i => i.invoice_type === 'cost' && i.to_company === '화림')
  const commInvoices  = initialInvoices.filter(i => i.invoice_type === 'commission' && i.from_company === '한국에이원')

  // ── 부족분 커미션 저장 ───────────────────────────
  async function handleSaveShortage() {
    if (!al30ProductId) { setError('AL30 품목 정보가 없습니다.'); return }
    const qty = parseFloat(form.qty_ton)
    const price = parseFloat(form.price_per_ton)
    if (!form.ym) { setError('기준 월을 입력하세요.'); return }
    if (!qty || qty <= 0) { setError('물량을 입력하세요.'); return }
    if (!price || price <= 0) { setError('화림 통보 단가를 입력하세요.'); return }

    const commAmt = Math.round(qty * price)
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: e } = await supabase
        .from('hyundai_transactions')
        .insert({
          year_month: form.ym,
          invoice_date: monthEnd(form.ym),
          quantity_kg: qty * 1000,
          sell_price: price,    // 화림 통보 단가
          cost_price: 0,
          commission_amount: commAmt,
          commission_type: 'shortage',
          memo: form.memo || `AL30 ${form.ym} 부족분 커미션 — ${fmtNum(qty, 3)}톤 × ${fmtNum(price)}원/톤`,
        })
        .select('*')
        .single()
      if (e) throw new Error(e.message)
      if (data) {
        setShortageList(prev => [data as ShortageEntry, ...prev])
        setForm(f => ({ ...f, qty_ton: '', price_per_ton: '', memo: '' }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteShortage(id: string) {
    if (!confirm('이 부족분 항목을 삭제하시겠습니까?')) return
    try {
      const supabase = createClient()
      const { error: e } = await supabase.from('hyundai_transactions').delete().eq('id', id)
      if (e) throw new Error(e.message)
      setShortageList(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // ── 커미션 현황 — 월별 정규 + 부족분 통합 ────────
  const commissionHistory = useMemo(() => {
    type HistRow = {
      key: string
      ym: string
      type: 'margin' | 'shortage'
      memo: string
      geumhwa: number
      raseong: number
      total: number
      isPaid?: boolean
    }
    const rows: HistRow[] = []

    // 정규 마진 (commInvoices는 선택 월만 있으므로, 더 광범위한 이력은 생략)
    if (commInvoices.length > 0) {
      const gm = commInvoices.find(i => i.to_company === '금화')
      const rs = commInvoices.find(i => i.to_company === '라성')
      rows.push({
        key: `margin-${yearMonth}`,
        ym: yearMonth,
        type: 'margin',
        memo: `${yearMonth} 마진`,
        geumhwa: gm ? Number(gm.supply_amount) : 0,
        raseong: rs ? Number(rs.supply_amount) : 0,
        total: (gm ? Number(gm.total_amount) : 0) + (rs ? Number(rs.total_amount) : 0),
        isPaid: !!(gm?.is_paid && rs?.is_paid),
      })
    }

    // 부족분 커미션
    for (const s of shortageList) {
      const { geumhwa, raseong } = splitMargin(s.commission_amount)
      rows.push({
        key: s.id,
        ym: s.year_month,
        type: 'shortage',
        memo: `${s.year_month} 부족분 커미션`,
        geumhwa,
        raseong,
        total: s.commission_amount,
      })
    }

    return rows.sort((a, b) => b.ym.localeCompare(a.ym))
  }, [commInvoices, shortageList, yearMonth])

  const next2M = shiftMonths(yearMonth, 2)

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────
  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">현대제철 AL30 전용 뷰</h2>
          <p className="text-sm text-gray-500 mt-0.5">10일 단위 계산서 · 60일 어음 · 부족분 커미션</p>
        </div>
        <input
          type="month"
          value={yearMonth}
          onChange={e => router.push(`/hyundai?month=${e.target.value}`)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
      )}

      {/* ─── 1. 10일 단위 입고 + 계산서 ─── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        {yearMonth} 입고 현황 — 10일 단위
      </h3>
      {initialDeliveries.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-gray-400 mb-6">
          {yearMonth} AL30 입고 데이터 없음
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {periodSummaries.map(ps => {
            if (ps.deliveries.length === 0) return null
            // 이 기간의 역발행 계산서 찾기 (memo에 기간 라벨 포함)
            const periodInv = salesInvoices.find(i => i.memo?.includes(ps.label))
            return (
              <div key={ps.label} className="card overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-800">{ps.label}</span>
                    <span className="text-xs text-gray-500">
                      발행기준일 {ps.basisDate}
                    </span>
                    <span className="text-xs text-blue-600 font-medium">
                      어음 만기 {addDays(ps.basisDate!, 60)}
                    </span>
                  </div>
                  {periodInv && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      periodInv.is_paid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {periodInv.is_paid ? '어음 완료' : '어음 미결'}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-th">입고일</th>
                        <th className="table-th text-right">물량(톤)</th>
                        <th className="table-th text-right">공급가액</th>
                        <th className="table-th text-right">VAT</th>
                        <th className="table-th text-right">합계</th>
                        <th className="table-th">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ps.deliveries.map(d => {
                        if (!d.contract) return null
                        const m = calcMarginFromContract(d.contract, d.quantity_kg)
                        const supply = Math.round(m.sell_price * m.quantity_ton)
                        return (
                          <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="table-td">{d.delivery_date ?? d.year_month}</td>
                            <td className="table-td text-right tabular-nums">{fmtNum(m.quantity_ton, 3)}</td>
                            <td className="table-td text-right tabular-nums">{fmtKrw(supply)}</td>
                            <td className="table-td text-right tabular-nums text-gray-500">{fmtKrw(Math.round(supply * 0.1))}</td>
                            <td className="table-td text-right tabular-nums font-semibold">{fmtKrw(Math.round(supply * 1.1))}</td>
                            <td className="table-td text-gray-500 text-xs">{d.memo ?? ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-sm">
                        <td className="px-4 py-2">소계</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtNum(ps.qtyTon!, 3)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtKrw(ps.sellTotal!)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500">{fmtKrw(Math.round(ps.sellTotal! * 0.1))}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-bold">{fmtKrw(Math.round(ps.sellTotal! * 1.1))}</td>
                        <td className="px-4 py-2 text-xs text-blue-600">
                          60일 어음 만기: {ps.billDueDate}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })}

          {/* 월 소계 */}
          <div className="card p-4 bg-blue-50 border-blue-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">
                  {yearMonth} 월 소계
                </p>
                <div className="flex gap-6 text-sm">
                  <div>
                    <p className="text-xs text-blue-500">총 물량</p>
                    <p className="font-semibold">{fmtNum(initialDeliveries.reduce((s, d) => s + d.quantity_kg / 1000, 0), 3)} 톤</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-500">총 매출</p>
                    <p className="font-semibold">{fmtKrw(monthTotal.sell)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-500">총 마진</p>
                    <p className="font-bold text-blue-700">{fmtKrw(monthTotal.margin)}</p>
                  </div>
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="text-green-600">한국에이원 {fmtKrw(monthTotal.korea_a1)}</div>
                <div className="text-purple-600">금화 {fmtKrw(monthTotal.geumhwa)}</div>
                <div className="text-orange-600">라성 {fmtKrw(monthTotal.raseong)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 2. 계산서 요약 ─── */}
      {initialInvoices.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            발행 지시 현황
          </h3>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-th">타입</th>
                    <th className="table-th">발행 → 수취</th>
                    <th className="table-th text-right">공급가액</th>
                    <th className="table-th text-right">합계</th>
                    <th className="table-th">발행기준일</th>
                    <th className="table-th">지급예정일</th>
                    <th className="table-th">메모</th>
                    <th className="table-th text-center">완료</th>
                  </tr>
                </thead>
                <tbody>
                  {initialInvoices.map(inv => (
                    <tr key={inv.id} className={`border-t border-gray-100 hover:bg-gray-50 ${inv.is_paid ? 'opacity-40' : ''}`}>
                      <td className="table-td">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          inv.invoice_type === 'sales'      ? 'bg-blue-100 text-blue-700' :
                          inv.invoice_type === 'cost'       ? 'bg-orange-100 text-orange-700' :
                          inv.invoice_type === 'commission' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {inv.invoice_type === 'sales' ? '매출' : inv.invoice_type === 'cost' ? '원가' : '커미션'}
                        </span>
                      </td>
                      <td className="table-td text-sm">
                        <span className="font-medium">{inv.from_company}</span>
                        <span className="text-gray-400 mx-1">→</span>
                        <span className="font-medium">{inv.to_company}</span>
                      </td>
                      <td className="table-td text-right tabular-nums">{fmtKrw(Number(inv.supply_amount))}</td>
                      <td className="table-td text-right tabular-nums font-semibold">{fmtKrw(Number(inv.total_amount))}</td>
                      <td className="table-td text-gray-600 whitespace-nowrap">{inv.invoice_basis_date ?? '—'}</td>
                      <td className="table-td text-gray-600 whitespace-nowrap">{inv.payment_due_date ?? '—'}</td>
                      <td className="table-td text-xs text-gray-400 max-w-xs truncate">{inv.memo ?? ''}</td>
                      <td className="table-td text-center">
                        {inv.is_paid
                          ? <span className="text-green-500 font-bold">✓</span>
                          : <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {costInvoice && (
              <div className="px-4 py-2 bg-orange-50 border-t border-orange-100 text-xs text-orange-700">
                한국에이원→화림 원가: 당월 합산 1장 ({fmtKrw(Number(costInvoice.total_amount))}) — 익익월1일 지급
                {' '}({next2M}-01)
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 3. 부족분 커미션 입력 ─── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        부족분 커미션 입력 <span className="font-normal normal-case text-gray-400">(화림 통보)</span>
      </h3>
      <div className="card p-5 mb-6 border-2 border-yellow-200">
        <p className="text-xs text-gray-500 mb-4">
          현대제철이 AL30을 약정 물량보다 덜 가져갔을 때, 화림이 통보한 물량과 단가를 입력하세요.
          금화/라성에 1/3 배분됩니다. 비고: "<strong>N월 부족분 커미션</strong>"
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="label">기준 월 *</label>
            <input
              type="month"
              className="input"
              value={form.ym}
              onChange={e => setForm(f => ({ ...f, ym: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">부족 물량 (톤) *</label>
            <div className="relative">
              <input
                type="number"
                className="input pr-10"
                value={form.qty_ton}
                onChange={e => setForm(f => ({ ...f, qty_ton: e.target.value }))}
                placeholder="예: 50.000"
                step="0.001"
                min="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">톤</span>
            </div>
          </div>
          <div>
            <label className="label">화림 단가 (원/톤) *</label>
            <div className="relative">
              <input
                type="number"
                className="input pr-14"
                value={form.price_per_ton}
                onChange={e => setForm(f => ({ ...f, price_per_ton: e.target.value }))}
                placeholder="예: 5000"
                step="100"
                min="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원/톤</span>
            </div>
          </div>
          <div>
            <label className="label">메모 (선택)</label>
            <input
              className="input"
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              placeholder="선택 입력"
            />
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
        <button
          onClick={handleSaveShortage}
          disabled={saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? '저장 중…' : '부족분 커미션 등록'}
        </button>
      </div>

      {/* ─── 4. 커미션 현황 (마진 + 부족분 통합) ─── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        커미션 현황 (마진 + 부족분)
      </h3>
      {commissionHistory.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-gray-400">
          커미션 이력 없음
        </div>
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
                  {commissionHistory.some(r => r.type === 'shortage') && (
                    <th className="table-th text-center w-16">관리</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {commissionHistory.map(row => (
                  <tr key={row.key} className={`border-t border-gray-100 hover:bg-gray-50 ${
                    row.type === 'shortage' ? 'bg-yellow-50' : ''
                  }`}>
                    <td className="table-td font-medium">{row.ym}</td>
                    <td className="table-td">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        row.type === 'margin'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-yellow-100 text-yellow-700'
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
                        : <span className="text-gray-400">수동</span>
                      }
                    </td>
                    {commissionHistory.some(r => r.type === 'shortage') && (
                      <td className="table-td text-center">
                        {row.type === 'shortage' && (
                          <button
                            onClick={() => handleDeleteShortage(row.key)}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            삭제
                          </button>
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
    </div>
  )
}
