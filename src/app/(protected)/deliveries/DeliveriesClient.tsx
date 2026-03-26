'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { calcMarginFromContract, calcAddlMargin, fmtKrw, fmtNum } from '@/lib/margin'

// ────────────────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────────────────
interface ProductRow {
  id: string
  display_name: string
  buyer: string
  price_unit: string   // 'KRW_TON' | 'USD_TON'
}

interface ContractRow {
  id: string
  product_id: string
  start_date: string
  end_date: string
  sell_price: number
  cost_price: number
  currency: 'KRW' | 'USD'
  reference_exchange_rate: number | null
}

interface DeliveryRow {
  id: string
  year_month: string
  delivery_date: string | null   // YYYY-MM-DD
  product_id: string
  contract_id: string
  quantity_kg: number
  addl_quantity_kg: number | null
  addl_margin_per_ton: number | null
  hoejin_shortage_kg: number | null
  hoejin_shortage_price: number | null
  memo: string | null
  created_at: string
  product: { id: string; display_name: string; buyer: string }
  contract: {
    id: string
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
    start_date: string
    end_date: string
  }
}

interface FormState {
  delivery_date: string   // YYYY-MM-DD (입고 날짜, year_month는 여기서 추출)
  product_id: string
  contract_id: string
  quantity_kg: string
  fesi_fx_rate: string    // FeSi BL 날짜 기준 실제 환율 (원/USD)
  use_addl: boolean
  addl_quantity_kg: string
  addl_margin_per_ton: string
  use_shortage: boolean
  hoejin_shortage_kg: string
  hoejin_shortage_price: string
  memo: string
}

// ────────────────────────────────────────────────────────
// 헬퍼
// ────────────────────────────────────────────────────────
function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function toYearMonth(date: string): string {
  return date.slice(0, 7)   // YYYY-MM-DD → YYYY-MM
}

function getCurrentYearMonth(): string {
  return getTodayDate().slice(0, 7)
}

function monthEnd(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(y, m, 0).toISOString().slice(0, 10)
}

function monthStart(yearMonth: string): string {
  return `${yearMonth}-01`
}

const EMPTY_FORM: FormState = {
  delivery_date: getTodayDate(),
  product_id: '',
  contract_id: '',
  quantity_kg: '',
  fesi_fx_rate: '',
  use_addl: false,
  addl_quantity_kg: '',
  addl_margin_per_ton: '',
  use_shortage: false,
  hoejin_shortage_kg: '',
  hoejin_shortage_price: '',
  memo: '',
}


// ────────────────────────────────────────────────────────
// MarginBox — 공통 배분 표시 카드
// ────────────────────────────────────────────────────────
function MarginBox({
  label,
  total,
  korea_a1,
  geumhwa,
  raseong,
  qty_ton,
  accent = false,
}: {
  label: string
  total: number
  korea_a1: number
  geumhwa: number
  raseong: number
  qty_ton: number
  accent?: boolean
}) {
  return (
    <div className={`rounded-lg p-4 ${accent ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-200'}`}>
      <p className={`text-xs font-semibold mb-3 ${accent ? 'text-blue-700' : 'text-gray-600'}`}>{label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
        <div>
          <p className="text-xs text-gray-400">물량</p>
          <p className="font-semibold text-gray-800">{fmtNum(qty_ton, 3)} 톤</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">총 마진</p>
          <p className={`font-bold ${accent ? 'text-blue-700' : 'text-gray-700'}`}>{fmtKrw(total)}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs border-t border-current border-opacity-10 pt-2">
        <div>
          <p className="text-gray-400">한국에이원</p>
          <p className="font-medium text-green-700">{fmtKrw(korea_a1)}</p>
        </div>
        <div>
          <p className="text-gray-400">금화</p>
          <p className="font-medium text-purple-700">{fmtKrw(geumhwa)}</p>
        </div>
        <div>
          <p className="text-gray-400">라성</p>
          <p className="font-medium text-orange-700">{fmtKrw(raseong)}</p>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────────────
export default function DeliveriesClient({
  products,
  contracts,
  initialDeliveries,
}: {
  products: ProductRow[]
  contracts: ContractRow[]
  initialDeliveries: DeliveryRow[]
}) {
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>(initialDeliveries)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterMonth, setFilterMonth] = useState(getCurrentYearMonth())

  // ── 선택된 품목 ──
  const selectedProduct = useMemo(
    () => products.find(p => p.id === form.product_id) ?? null,
    [products, form.product_id]
  )
  const isFeSi = selectedProduct?.price_unit === 'USD_TON'

  // ── 입고 날짜에서 year_month 추출 ──
  const formYearMonth = form.delivery_date ? toYearMonth(form.delivery_date) : ''

  // ── 해당 월에 유효한 계약 목록 ──
  const availableContracts = useMemo(() => {
    if (!form.product_id || !formYearMonth) return []
    const ms = monthStart(formYearMonth)
    const me = monthEnd(formYearMonth)
    return contracts.filter(c =>
      c.product_id === form.product_id &&
      c.start_date <= me &&
      c.end_date >= ms
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.product_id, formYearMonth, contracts])

  // ── 선택된 계약 ──
  const selectedContract = useMemo(
    () => contracts.find(c => c.id === form.contract_id) ?? null,
    [contracts, form.contract_id]
  )

  // ── FeSi 환율 오버라이드 적용 계약 ──
  const contractForPreview = useMemo(() => {
    if (!selectedContract) return null
    if (isFeSi && form.fesi_fx_rate) {
      const rate = parseFloat(form.fesi_fx_rate)
      if (rate > 0) return { ...selectedContract, reference_exchange_rate: rate }
    }
    return selectedContract
  }, [selectedContract, isFeSi, form.fesi_fx_rate])

  // ── 기본 물량 마진 미리보기 ──
  const mainMargin = useMemo(() => {
    if (!contractForPreview) return null
    const qty = parseFloat(form.quantity_kg)
    if (!qty || qty <= 0) return null
    return calcMarginFromContract(contractForPreview, qty * 1000)
  }, [contractForPreview, form.quantity_kg])

  // ── 추가 배분 마진 미리보기 ──
  const addlMargin = useMemo(() => {
    if (!form.use_addl) return null
    const qty = parseFloat(form.addl_quantity_kg)
    const mpt = parseFloat(form.addl_margin_per_ton)
    if (!qty || qty <= 0 || !mpt) return null
    return calcAddlMargin(qty * 1000, mpt)
  }, [form.use_addl, form.addl_quantity_kg, form.addl_margin_per_ton])

  // ── 합계 마진 ──
  const combinedMargin = useMemo(() => {
    if (!mainMargin && !addlMargin) return null
    const total = (mainMargin?.total_margin ?? 0) + (addlMargin?.total_margin ?? 0)
    const base = Math.floor(total / 3)
    return { total, korea_a1: base, geumhwa: base, raseong: total - base * 2 }
  }, [mainMargin, addlMargin])

  // ────────────────────────
  // 폼 열기 / 닫기
  // ────────────────────────
  function openNew() {
    setEditId(null)
    // 조회 중인 월이 있으면 그 달 1일을 기본값으로
    const defaultDate = filterMonth ? `${filterMonth}-01` : getTodayDate()
    setForm({ ...EMPTY_FORM, delivery_date: defaultDate })
    setError('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openEdit(d: DeliveryRow) {
    setEditId(d.id)
    setForm({
      delivery_date: d.delivery_date ?? `${d.year_month}-01`,
      product_id: d.product_id,
      contract_id: d.contract_id,
      quantity_kg: String(d.quantity_kg / 1000),
      fesi_fx_rate: '',
      use_addl: !!(d.addl_quantity_kg && d.addl_quantity_kg > 0),
      addl_quantity_kg: d.addl_quantity_kg ? String(d.addl_quantity_kg / 1000) : '',
      addl_margin_per_ton: d.addl_margin_per_ton ? String(d.addl_margin_per_ton) : '',
      use_shortage: !!(d.hoejin_shortage_kg && d.hoejin_shortage_kg > 0),
      hoejin_shortage_kg: d.hoejin_shortage_kg ? String(d.hoejin_shortage_kg / 1000) : '',
      hoejin_shortage_price: d.hoejin_shortage_price ? String(d.hoejin_shortage_price) : '',
      memo: d.memo ?? '',
    })
    setError('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeForm() {
    setShowForm(false)
    setError('')
  }

  // ────────────────────────
  // 저장
  // ────────────────────────
  async function handleSave() {
    if (!form.delivery_date) { setError('입고 날짜를 입력하세요.'); return }
    if (!form.product_id)    { setError('품목을 선택하세요.'); return }
    if (!form.contract_id)   { setError('낙찰 단가를 선택하세요.'); return }
    const qty = parseFloat(form.quantity_kg)
    if (!qty || qty <= 0) { setError('물량(톤)을 입력하세요.'); return }

    if (form.use_addl) {
      const addlQty = parseFloat(form.addl_quantity_kg)
      const addlMpt = parseFloat(form.addl_margin_per_ton)
      if (!addlQty || addlQty <= 0) { setError('추가 배분 물량을 입력하세요.'); return }
      if (!addlMpt) { setError('추가 배분 마진 단가를 입력하세요.'); return }
    }

    setSaving(true)
    setError('')

    const yearMonth = toYearMonth(form.delivery_date)
    const payload = {
      delivery_date: form.delivery_date,
      year_month: yearMonth,
      product_id: form.product_id,
      contract_id: form.contract_id,
      quantity_kg: qty * 1000,
      addl_quantity_kg: form.use_addl && form.addl_quantity_kg
        ? parseFloat(form.addl_quantity_kg) * 1000
        : null,
      addl_margin_per_ton: form.use_addl && form.addl_margin_per_ton
        ? parseFloat(form.addl_margin_per_ton)
        : null,
      hoejin_shortage_kg: form.use_shortage && form.hoejin_shortage_kg
        ? parseFloat(form.hoejin_shortage_kg) * 1000
        : null,
      hoejin_shortage_price: form.use_shortage && form.hoejin_shortage_price
        ? parseFloat(form.hoejin_shortage_price)
        : null,
      memo: form.memo || null,
    }

    const supabase = createClient()

    // FeSi BL 날짜 환율 입력 시 fx_rates 테이블에 upsert
    if (isFeSi && form.fesi_fx_rate) {
      const rate = parseFloat(form.fesi_fx_rate)
      if (rate > 0) {
        await supabase.from('fx_rates').upsert({
          product_id: form.product_id,
          bl_date: form.delivery_date,
          rate_krw_per_usd: rate,
          memo: '입고 등록 시 입력',
        }, { onConflict: 'product_id,bl_date' })
      }
    }

    const SELECT = `
      id, year_month, delivery_date, product_id, contract_id,
      quantity_kg, addl_quantity_kg, addl_margin_per_ton,
      hoejin_shortage_kg, hoejin_shortage_price,
      memo, created_at,
      product:products(id, display_name, buyer),
      contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate, start_date, end_date)
    `

    const result = editId
      ? await supabase.from('deliveries').update(payload).eq('id', editId).select(SELECT).single()
      : await supabase.from('deliveries').insert(payload).select(SELECT).single()

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saved = result.data as any as DeliveryRow
    setDeliveries(prev =>
      editId
        ? prev.map(d => d.id === editId ? saved : d)
        : [saved, ...prev]
    )
    setShowForm(false)
    setSaving(false)
  }

  // ────────────────────────
  // 삭제
  // ────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('이 입고 데이터를 삭제하시겠습니까?')) return
    const supabase = createClient()
    const { error: err } = await supabase.from('deliveries').delete().eq('id', id)
    if (err) { alert('삭제 실패: ' + err.message); return }
    setDeliveries(prev => prev.filter(d => d.id !== id))
  }

  // ────────────────────────
  // 필터 / 집계
  // ────────────────────────
  const filtered = useMemo(
    () => deliveries.filter(d => !filterMonth || d.year_month === filterMonth),
    [deliveries, filterMonth]
  )

  const monthTotal = useMemo(() => {
    let total = 0, korea_a1 = 0, geumhwa = 0, raseong = 0
    for (const d of filtered) {
      if (!d.contract) continue
      const m = calcMarginFromContract(d.contract, d.quantity_kg)
      total    += m.total_margin
      korea_a1 += m.korea_a1
      geumhwa  += m.geumhwa
      raseong  += m.raseong
      // 추가 배분 포함
      if (d.addl_quantity_kg && d.addl_margin_per_ton) {
        const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
        total    += am.total_margin
        korea_a1 += am.korea_a1
        geumhwa  += am.geumhwa
        raseong  += am.raseong
      }
    }
    return { total, korea_a1, geumhwa, raseong }
  }, [filtered])

  // ────────────────────────────────────────────────────────
  // 렌더링
  // ────────────────────────────────────────────────────────
  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">입고 입력</h2>
          <p className="text-sm text-gray-500 mt-0.5">물량 입력 → 마진 자동 계산 (1/3 배분)</p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ 입고 입력</button>
      </div>

      {/* ══════════════════════════════════════════
          입력 / 수정 폼
      ══════════════════════════════════════════ */}
      {showForm && (
        <div className="card p-5 mb-6 border-2 border-blue-200">
          <h3 className="text-base font-semibold text-gray-900 mb-5">
            {editId ? '입고 수정' : '새 입고 입력'}
          </h3>

          {/* ─ STEP 1: 날짜 / 품목 ─ */}
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Step 1 — 입고 날짜 · 품목 선택
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  입고 날짜 *
                  <span className="ml-1 text-gray-400 font-normal text-xs">
                    — 납품 월은 자동 추출
                  </span>
                </label>
                <input
                  type="date"
                  className="input"
                  value={form.delivery_date}
                  onChange={e =>
                    setForm(f => ({ ...f, delivery_date: e.target.value, contract_id: '' }))
                  }
                />
                {form.delivery_date && (
                  <p className="mt-1 text-xs text-gray-400">
                    납품 월: <span className="font-medium text-gray-600">{toYearMonth(form.delivery_date)}</span>
                    {selectedProduct?.price_unit === 'USD_TON' && (
                      <span className="ml-2 text-blue-500">· FeSi BL 날짜 기준</span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className="label">품목 *</label>
                <select
                  className="input"
                  value={form.product_id}
                  onChange={e =>
                    setForm(f => ({ ...f, product_id: e.target.value, contract_id: '' }))
                  }
                >
                  <option value="">품목 선택</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}{p.price_unit === 'USD_TON' ? ' (USD)' : ''} — {p.buyer}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ─ STEP 2: 낙찰 단가 선택 ─ */}
          {form.product_id && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Step 2 — 낙찰 단가 선택
              </p>
              {availableContracts.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md px-4 py-3">
                  <span>⚠</span>
                  <span>
                    <strong>{formYearMonth}</strong>에 유효한 낙찰 단가가 없습니다.
                    먼저 <a href="/contracts" className="underline">낙찰 단가 관리</a>에서 등록하세요.
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableContracts.map(c => {
                    const isSelected = form.contract_id === c.id
                    const isUsd = c.currency === 'USD'
                    const marginPerTon = isUsd && c.reference_exchange_rate
                      ? (c.sell_price - c.cost_price) * c.reference_exchange_rate
                      : c.sell_price - c.cost_price

                    return (
                      <label
                        key={c.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="contract"
                          value={c.id}
                          checked={isSelected}
                          onChange={() => setForm(f => ({ ...f, contract_id: c.id }))}
                          className="mt-0.5"
                        />
                        <div className="flex-1 text-sm">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="font-medium text-gray-800">
                              {c.start_date.slice(0, 10)} ~ {c.end_date.slice(0, 10)}
                            </span>
                            {isUsd && (
                              <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">
                                USD 원가
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                            <span>
                              판매 {isUsd
                                ? `${fmtNum(c.sell_price, 2)} USD/톤${c.reference_exchange_rate ? ` (≈${fmtNum(c.sell_price * c.reference_exchange_rate)}원)` : ''}`
                                : `${fmtNum(c.sell_price)} 원/톤`}
                            </span>
                            <span>
                              원가 {isUsd
                                ? `${fmtNum(c.cost_price, 2)} USD/톤${c.reference_exchange_rate ? ` (≈${fmtNum(c.cost_price * c.reference_exchange_rate)}원)` : ''}`
                                : `${fmtNum(c.cost_price)} 원/톤`}
                            </span>
                            <span className={`font-semibold ${marginPerTon >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                              마진 {fmtNum(marginPerTon)} 원/톤
                              {isUsd && c.reference_exchange_rate && (
                                <span className="font-normal text-gray-400 ml-1">(참고 환율 기준)</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─ STEP 3: 물량 입력 ─ */}
          {form.contract_id && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Step 3 — 물량 입력
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">
                    기본 물량 (톤) *
                    <span className="text-gray-400 font-normal ml-1">— 소수점 3자리</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      className="input pr-10"
                      value={form.quantity_kg}
                      onChange={e => setForm(f => ({ ...f, quantity_kg: e.target.value }))}
                      placeholder="예: 50.000"
                      step="0.001"
                      min="0"
                      autoFocus
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">톤</span>
                  </div>
                  {form.quantity_kg && parseFloat(form.quantity_kg) > 0 && (
                    <p className="mt-1 text-xs text-gray-400">
                      = {fmtNum(parseFloat(form.quantity_kg) * 1000)} kg
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">메모</label>
                  <input
                    className="input"
                    value={form.memo}
                    onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                    placeholder="선택 입력"
                  />
                </div>

                {/* FeSi BL 날짜 실제 환율 */}
                {isFeSi && (
                  <div className="sm:col-span-2 rounded-lg bg-blue-50 border border-blue-100 p-4">
                    <p className="text-xs font-semibold text-blue-700 mb-3">FeSi — BL 날짜 기준 실제 환율</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="label">
                          실제 환율 (원/USD)
                          <span className="text-gray-400 font-normal ml-1">— BL 날짜 기준 동국제강 지정</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            className="input pr-16"
                            value={form.fesi_fx_rate}
                            onChange={e => setForm(f => ({ ...f, fesi_fx_rate: e.target.value }))}
                            placeholder={selectedContract?.reference_exchange_rate
                              ? `참고: ${fmtNum(selectedContract.reference_exchange_rate)}`
                              : '예: 1,380'
                            }
                            step="1"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원/USD</span>
                        </div>
                        {selectedContract?.reference_exchange_rate && (
                          <p className="mt-1 text-xs text-gray-400">
                            계약 참고환율: {fmtNum(selectedContract.reference_exchange_rate)}원
                            {form.fesi_fx_rate && parseFloat(form.fesi_fx_rate) !== selectedContract.reference_exchange_rate && (
                              <span className="ml-2 text-blue-600 font-medium">
                                → 입력 환율로 미리보기 반영 중
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      {form.fesi_fx_rate && form.quantity_kg && selectedContract && (
                        <div className="text-sm">
                          <p className="text-xs text-gray-500 mb-1">환율 기준 원화 환산</p>
                          <p className="text-gray-700">
                            판매: <span className="font-semibold">{fmtNum(selectedContract.sell_price, 2)} USD/톤</span>
                            <span className="text-gray-400 ml-1">
                              ≈ {fmtNum(selectedContract.sell_price * parseFloat(form.fesi_fx_rate))}원
                            </span>
                          </p>
                          <p className="text-gray-700 mt-0.5">
                            원가: <span className="font-semibold">{fmtNum(selectedContract.cost_price, 2)} USD/톤</span>
                            <span className="text-gray-400 ml-1">
                              ≈ {fmtNum(selectedContract.cost_price * parseFloat(form.fesi_fx_rate))}원
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      입력 시 저장하면 fx_rates 테이블에 자동 반영됩니다. 미입력 시 계약 참고환율로 계산됩니다.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─ 호진 추가 배분 / 부족분 토글 ─ */}
          {form.contract_id && (
            <div className="mb-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.use_addl}
                  onChange={e => setForm(f => ({ ...f, use_addl: e.target.checked, addl_quantity_kg: '', addl_margin_per_ton: '' }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">
                  추가 배분 입력 <span className="text-gray-400 font-normal">(호진 배분 등)</span>
                </span>
              </label>

              {form.use_addl && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6 border-l-2 border-orange-200">
                  <div>
                    <label className="label">
                      추가 물량 (톤) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        className="input pr-10"
                        value={form.addl_quantity_kg}
                        onChange={e => setForm(f => ({ ...f, addl_quantity_kg: e.target.value }))}
                        placeholder="예: 20.000"
                        step="0.001"
                        min="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">톤</span>
                    </div>
                  </div>
                  <div>
                    <label className="label">
                      추가 마진 단가 (원/톤) *
                      <span className="text-gray-400 font-normal ml-1">화림 결정</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        className="input pr-14"
                        value={form.addl_margin_per_ton}
                        onChange={e => setForm(f => ({ ...f, addl_margin_per_ton: e.target.value }))}
                        placeholder="예: 5000"
                        step="100"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원/톤</span>
                    </div>
                  </div>
                  <p className="col-span-full text-xs text-gray-500">
                    호진이 물량을 <strong>더</strong> 가져갈 때 — 화림→한국에이원 커미션 지급 (익월10일, 1/3 배분)
                  </p>
                </div>
              )}

              {/* 호진 부족분 지급 토글 */}
              <label className="flex items-center gap-2 cursor-pointer select-none mt-3">
                <input
                  type="checkbox"
                  checked={form.use_shortage}
                  onChange={e => setForm(f => ({ ...f, use_shortage: e.target.checked, hoejin_shortage_kg: '', hoejin_shortage_price: '' }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">
                  호진 부족분 지급 <span className="text-gray-400 font-normal">(덜 가져갈 때)</span>
                </span>
              </label>

              {form.use_shortage && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6 border-l-2 border-red-200">
                  <div>
                    <label className="label">부족 물량 (톤) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="input pr-10"
                        value={form.hoejin_shortage_kg}
                        onChange={e => setForm(f => ({ ...f, hoejin_shortage_kg: e.target.value }))}
                        placeholder="예: 5.000"
                        step="0.001"
                        min="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">톤</span>
                    </div>
                  </div>
                  <div>
                    <label className="label">
                      화림 통보 단가 (원/톤) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        className="input pr-14"
                        value={form.hoejin_shortage_price}
                        onChange={e => setForm(f => ({ ...f, hoejin_shortage_price: e.target.value }))}
                        placeholder="예: 30000"
                        step="100"
                        min="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원/톤</span>
                    </div>
                  </div>
                  {form.hoejin_shortage_kg && form.hoejin_shortage_price && (
                    <div className="col-span-full bg-red-50 border border-red-100 rounded p-3">
                      <p className="text-xs text-red-600 font-medium">
                        한국에이원→호진 지급:{' '}
                        {fmtKrw(parseFloat(form.hoejin_shortage_kg) * parseFloat(form.hoejin_shortage_price))}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">당월말 기준, 익월10일 지급</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─ 마진 미리보기 ─ */}
          {(mainMargin || addlMargin) && (
            <div className="mb-5 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">마진 미리보기</p>

              {/* 기본 물량 마진 */}
              {mainMargin && (
                <>
                  {isFeSi && mainMargin.exchange_rate_used && contractForPreview && (
                    <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-2 text-xs text-blue-700">
                      <span className="font-semibold">USD 마진: </span>
                      {fmtNum(contractForPreview.sell_price - contractForPreview.cost_price, 2)} USD/톤
                      <span className="text-gray-500 mx-2">×</span>
                      {fmtNum(mainMargin.quantity_ton, 3)} 톤
                      <span className="text-gray-500 mx-2">=</span>
                      <span className="font-bold">
                        {fmtNum((contractForPreview.sell_price - contractForPreview.cost_price) * mainMargin.quantity_ton, 2)} USD
                      </span>
                      <span className="text-gray-400 ml-2">
                        (환율 {fmtNum(mainMargin.exchange_rate_used)}원 적용)
                      </span>
                    </div>
                  )}
                  <MarginBox
                    label={isFeSi
                      ? `기본 물량 마진 (${form.fesi_fx_rate ? '입력 환율' : '참고 환율'} ${fmtNum(mainMargin.exchange_rate_used ?? 0)}원 기준)`
                      : '기본 물량 마진'}
                    total={mainMargin.total_margin}
                    korea_a1={mainMargin.korea_a1}
                    geumhwa={mainMargin.geumhwa}
                    raseong={mainMargin.raseong}
                    qty_ton={mainMargin.quantity_ton}
                    accent={!addlMargin}
                  />
                </>
              )}

              {/* 추가 배분 마진 */}
              {addlMargin && (
                <MarginBox
                  label="추가 배분 마진 (호진 배분)"
                  total={addlMargin.total_margin}
                  korea_a1={addlMargin.korea_a1}
                  geumhwa={addlMargin.geumhwa}
                  raseong={addlMargin.raseong}
                  qty_ton={addlMargin.quantity_ton}
                />
              )}

              {/* 합계 (추가 배분 있을 때) */}
              {mainMargin && addlMargin && combinedMargin && (
                <div className="rounded-lg p-4 bg-blue-600 text-white">
                  <p className="text-xs font-semibold text-blue-100 mb-3">합계 마진</p>
                  <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                    <div>
                      <p className="text-xs text-blue-200">총 물량</p>
                      <p className="font-semibold">
                        {fmtNum(mainMargin.quantity_ton + (addlMargin?.quantity_ton ?? 0), 3)} 톤
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-200">총 마진</p>
                      <p className="text-xl font-bold">{fmtKrw(combinedMargin.total)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs border-t border-blue-500 pt-2">
                    <div>
                      <p className="text-blue-200">한국에이원</p>
                      <p className="font-bold">{fmtKrw(combinedMargin.korea_a1)}</p>
                    </div>
                    <div>
                      <p className="text-blue-200">금화</p>
                      <p className="font-bold">{fmtKrw(combinedMargin.geumhwa)}</p>
                    </div>
                    <div>
                      <p className="text-blue-200">라성</p>
                      <p className="font-bold">{fmtKrw(combinedMargin.raseong)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* FeSi 환율 안내 */}
              {isFeSi && !selectedContract?.reference_exchange_rate && !form.fesi_fx_rate && (
                <p className="text-xs text-yellow-600">
                  ⚠ 참고 환율이 없습니다. 위 BL 환율 입력란에 실제 환율을 입력하면 마진 미리보기가 표시됩니다.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <div className="flex gap-2">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : editId ? '수정 저장' : '입고 등록'}
            </button>
            <button className="btn-secondary" onClick={closeForm}>취소</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          월 필터 + 월 마진 합계
      ══════════════════════════════════════════ */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600 font-medium">조회 월:</label>
        <input
          type="month"
          className="input w-auto"
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
        />
        <span className="text-xs text-gray-400">{filtered.length}건</span>
      </div>

      {filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: '총 마진',    value: monthTotal.total,    color: 'text-blue-600' },
            { label: '한국에이원', value: monthTotal.korea_a1, color: 'text-green-600' },
            { label: '금화',       value: monthTotal.geumhwa,  color: 'text-purple-600' },
            { label: '라성',       value: monthTotal.raseong,  color: 'text-orange-600' },
          ].map(c => (
            <div key={c.label} className="card p-3">
              <p className="text-xs text-gray-500">{filterMonth} {c.label}</p>
              <p className={`text-lg font-bold ${c.color}`}>{fmtKrw(c.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════
          목록 테이블
      ══════════════════════════════════════════ */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th">입고 날짜</th>
              <th className="table-th">품목</th>
              <th className="table-th">납품처</th>
              <th className="table-th text-right">물량 (톤)</th>
              <th className="table-th text-right">판매단가</th>
              <th className="table-th text-right">원가단가</th>
              <th className="table-th text-right">기본 마진</th>
              <th className="table-th text-right">추가 배분</th>
              <th className="table-th text-right">합계 마진</th>
              <th className="table-th text-right">한국에이원</th>
              <th className="table-th text-right">금화</th>
              <th className="table-th text-right">라성</th>
              <th className="table-th">메모</th>
              <th className="table-th">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={14} className="table-td text-center text-gray-400 py-10">
                  {filterMonth} 입고 데이터가 없습니다.
                </td>
              </tr>
            )}
            {filtered.map(d => {
              if (!d.contract) return null
              const main = calcMarginFromContract(d.contract, d.quantity_kg)
              const addl = d.addl_quantity_kg && d.addl_margin_per_ton
                ? calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
                : null

              const combinedTotal = main.total_margin + (addl?.total_margin ?? 0)
              const base = Math.floor(combinedTotal / 3)
              const combined = { total: combinedTotal, a1: base, gm: base, rs: combinedTotal - base * 2 }

              const isUsd = d.contract.currency === 'USD'

              return (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="table-td font-mono text-xs whitespace-nowrap">
                    {d.delivery_date
                      ? <>{d.delivery_date}<br/><span className="text-gray-400">{d.year_month}</span></>
                      : d.year_month
                    }
                  </td>
                  <td className="table-td whitespace-nowrap">
                    <span className="font-medium">{d.product?.display_name}</span>
                    {isUsd && (
                      <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1 rounded">USD</span>
                    )}
                  </td>
                  <td className="table-td text-gray-500 text-xs whitespace-nowrap">{d.product?.buyer}</td>
                  <td className="table-td text-right whitespace-nowrap">
                    {fmtNum(d.quantity_kg / 1000, 3)}
                    {addl && (
                      <div className="text-xs text-orange-500">
                        +{fmtNum(d.addl_quantity_kg! / 1000, 3)}
                      </div>
                    )}
                  </td>
                  <td className="table-td text-right whitespace-nowrap">
                    {isUsd
                      ? <>{fmtNum(d.contract.sell_price, 2)}<span className="text-gray-400 text-xs">USD</span></>
                      : <>{fmtNum(d.contract.sell_price)}<span className="text-gray-400 text-xs">원</span></>
                    }
                  </td>
                  <td className="table-td text-right whitespace-nowrap">
                    {isUsd
                      ? <>{fmtNum(d.contract.cost_price, 2)}<span className="text-gray-400 text-xs">USD</span></>
                      : <>{fmtNum(d.contract.cost_price)}<span className="text-gray-400 text-xs">원</span></>
                    }
                  </td>
                  <td className="table-td text-right text-blue-600 whitespace-nowrap">
                    {fmtKrw(main.total_margin)}
                  </td>
                  <td className="table-td text-right text-orange-500 whitespace-nowrap">
                    {addl ? fmtKrw(addl.total_margin) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-td text-right font-bold text-blue-700 whitespace-nowrap">
                    {fmtKrw(combined.total)}
                  </td>
                  <td className="table-td text-right text-green-600 whitespace-nowrap">{fmtKrw(combined.a1)}</td>
                  <td className="table-td text-right text-purple-600 whitespace-nowrap">{fmtKrw(combined.gm)}</td>
                  <td className="table-td text-right text-orange-600 whitespace-nowrap">{fmtKrw(combined.rs)}</td>
                  <td className="table-td text-xs text-gray-400 max-w-[80px] truncate">{d.memo}</td>
                  <td className="table-td whitespace-nowrap">
                    <button className="text-xs text-blue-600 hover:underline mr-2" onClick={() => openEdit(d)}>수정</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => handleDelete(d.id)}>삭제</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
