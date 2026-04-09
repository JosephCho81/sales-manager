'use client'

import { useState, useMemo } from 'react'
import { upsertDelivery, upsertFxRate } from './actions'
import { calcMarginFromContract, calcAddlMargin, fmtKrw, fmtNum } from '@/lib/margin'
import { getTodayDate, toYearMonth, monthStart, monthEnd, shiftMonths } from '@/lib/date'
import type { ProductRow, ContractRow, DeliveryRow, FormState } from './types'
import MarginPreview from './MarginPreview'

// ────────────────────────────────────────────────────────
// 폼 초기값
// ────────────────────────────────────────────────────────
function makeEmptyForm(defaultDate?: string): FormState {
  return {
    delivery_date: defaultDate ?? getTodayDate(),
    product_id: '', contract_id: '', quantity_kg: '', fesi_fx_rate: '',
    use_addl: false, addl_quantity_kg: '', addl_margin_per_ton: '',
    use_shortage: false, hoejin_shortage_kg: '', hoejin_shortage_price: '',
    depreciation_ton: '',
    memo: '',
  }
}

function formFromDelivery(d: DeliveryRow): FormState {
  return {
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
    depreciation_ton: d.depreciation_kg ? String(d.depreciation_kg / 1000) : '',
    memo: d.memo ?? '',
  }
}

// ────────────────────────────────────────────────────────
// DeliveryForm
//   editDelivery: null = 새 입고, DeliveryRow = 수정
// ────────────────────────────────────────────────────────
export default function DeliveryForm({
  products,
  contracts,
  editDelivery,
  defaultYearMonth,
  onClose,
  onSaved,
}: {
  products: ProductRow[]
  contracts: ContractRow[]
  editDelivery: DeliveryRow | null
  defaultYearMonth: string
  onClose: () => void
  onSaved: (saved: DeliveryRow) => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    editDelivery ? formFromDelivery(editDelivery) : makeEmptyForm(`${defaultYearMonth}-01`)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ── 파생 상태 ──
  const selectedProduct = useMemo(
    () => products.find(p => p.id === form.product_id) ?? null,
    [products, form.product_id]
  )
  const isFeSi = selectedProduct?.price_unit === 'USD_TON'
  const isCoal = selectedProduct?.name === 'SOGGAE' || selectedProduct?.name === 'BUNTAN'
  const formYearMonth = form.delivery_date ? toYearMonth(form.delivery_date) : ''

  const availableContracts = useMemo(() => {
    if (!form.product_id || !formYearMonth) return []
    const ms = monthStart(formYearMonth)
    const me = monthEnd(formYearMonth)
    return contracts.filter(c =>
      c.product_id === form.product_id && c.start_date <= me && c.end_date >= ms
    )
  }, [form.product_id, formYearMonth, contracts])

  const selectedContract = useMemo(
    () => contracts.find(c => c.id === form.contract_id) ?? null,
    [contracts, form.contract_id]
  )

  const contractForPreview = useMemo(() => {
    if (!selectedContract) return null
    if (isFeSi && form.fesi_fx_rate) {
      const rate = parseFloat(form.fesi_fx_rate)
      if (rate > 0) return { ...selectedContract, reference_exchange_rate: rate }
    }
    return selectedContract
  }, [selectedContract, isFeSi, form.fesi_fx_rate])

  const mainMargin = useMemo(() => {
    if (!contractForPreview) return null
    const qty = parseFloat(form.quantity_kg)
    if (!qty || qty <= 0) return null
    return calcMarginFromContract(contractForPreview, qty * 1000)
  }, [contractForPreview, form.quantity_kg])

  const addlMargin = useMemo(() => {
    if (!form.use_addl) return null
    const qty = parseFloat(form.addl_quantity_kg)
    const mpt = parseFloat(form.addl_margin_per_ton)
    if (!qty || qty <= 0 || !mpt) return null
    return calcAddlMargin(qty * 1000, mpt)
  }, [form.use_addl, form.addl_quantity_kg, form.addl_margin_per_ton])

  const combinedMargin = useMemo(() => {
    if (!mainMargin && !addlMargin) return null
    const total = (mainMargin?.total_margin ?? 0) + (addlMargin?.total_margin ?? 0)
    const base = Math.floor(total / 3)
    return { total, korea_a1: base, geumhwa: base, raseong: total - base * 2 }
  }, [mainMargin, addlMargin])

  // ── 저장 ──
  async function handleSave() {
    if (!form.delivery_date) { setError('입고 날짜를 입력하세요.'); return }
    if (!form.product_id)    { setError('품목을 선택하세요.'); return }
    if (!form.contract_id)   { setError('낙찰 단가를 선택하세요.'); return }
    const qty = parseFloat(form.quantity_kg)
    if (!qty || qty <= 0)    { setError('물량(톤)을 입력하세요.'); return }
    if (form.use_addl) {
      if (!parseFloat(form.addl_quantity_kg) || parseFloat(form.addl_quantity_kg) <= 0)
        { setError('추가 배분 물량을 입력하세요.'); return }
      if (!parseFloat(form.addl_margin_per_ton))
        { setError('추가 배분 마진 단가를 입력하세요.'); return }
    }

    setSaving(true); setError('')

    const deliveryYearMonth = toYearMonth(form.delivery_date)
    const offset = selectedContract?.invoice_month_offset ?? 0
    const payload = {
      delivery_date: form.delivery_date,
      year_month: deliveryYearMonth,
      invoice_month: shiftMonths(deliveryYearMonth, offset),
      product_id: form.product_id,
      contract_id: form.contract_id,
      quantity_kg: qty * 1000,
      addl_quantity_kg: form.use_addl && form.addl_quantity_kg
        ? parseFloat(form.addl_quantity_kg) * 1000 : null,
      addl_margin_per_ton: form.use_addl && form.addl_margin_per_ton
        ? parseFloat(form.addl_margin_per_ton) : null,
      hoejin_shortage_kg: form.use_shortage && form.hoejin_shortage_kg
        ? parseFloat(form.hoejin_shortage_kg) * 1000 : null,
      hoejin_shortage_price: form.use_shortage && form.hoejin_shortage_price
        ? parseFloat(form.hoejin_shortage_price) : null,
      depreciation_kg: isCoal && form.depreciation_ton
        ? parseFloat(form.depreciation_ton) * 1000 : null,
      memo: form.memo || null,
    }

    if (isFeSi && form.fesi_fx_rate) {
      const rate = parseFloat(form.fesi_fx_rate)
      if (rate > 0) await upsertFxRate(form.product_id, form.delivery_date, rate)
    }

    const result = await upsertDelivery(payload, editDelivery?.id)
    if (result.error) { setError(result.error); setSaving(false); return }

    onSaved(result.data as unknown as DeliveryRow)
  }

  // ────────────────────────────────────────────────────────
  // 렌더
  // ────────────────────────────────────────────────────────
  return (
    <div className="card p-5 mb-6 border-2 border-blue-200">
      <h3 className="text-base font-semibold text-gray-900 mb-5">
        {editDelivery ? '입고 수정' : '새 입고 입력'}
      </h3>

      {/* STEP 1 — 날짜 / 품목 */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Step 1 — 입고 날짜 · 품목 선택
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">
              입고 날짜 *
              <span className="ml-1 text-gray-400 font-normal text-xs">— 납품 월은 자동 추출</span>
            </label>
            <input
              type="date" className="input" value={form.delivery_date}
              onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value, contract_id: '' }))}
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
              className="input" value={form.product_id}
              onChange={e => setForm(f => ({ ...f, product_id: e.target.value, contract_id: '' }))}
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

      {/* STEP 2 — 낙찰 단가 */}
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
                      isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio" name="contract" value={c.id} checked={isSelected}
                      onChange={() => setForm(f => ({ ...f, contract_id: c.id }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1 text-sm">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-medium text-gray-800">
                          {c.start_date.slice(0, 10)} ~ {c.end_date.slice(0, 10)}
                        </span>
                        {isUsd && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">USD 원가</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                        <span>판매 {isUsd
                          ? `${fmtNum(c.sell_price, 2)} USD/톤${c.reference_exchange_rate ? ` (≈${fmtNum(c.sell_price * c.reference_exchange_rate)}원)` : ''}`
                          : `${fmtNum(c.sell_price)} 원/톤`}
                        </span>
                        <span>원가 {isUsd
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

      {/* STEP 3 — 물량 */}
      {form.contract_id && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Step 3 — 물량 입력
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">기본 물량 (톤) *<span className="text-gray-400 font-normal ml-1">— 소수점 3자리</span></label>
              <div className="relative">
                <input
                  type="number" className="input pr-10" value={form.quantity_kg}
                  onChange={e => setForm(f => ({ ...f, quantity_kg: e.target.value }))}
                  placeholder="예: 50.000" step="0.001" min="0" autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">톤</span>
              </div>
              {form.quantity_kg && parseFloat(form.quantity_kg) > 0 && (
                <p className="mt-1 text-xs text-gray-400">= {fmtNum(parseFloat(form.quantity_kg) * 1000)} kg</p>
              )}
            </div>
            <div>
              <label className="label">메모</label>
              <input className="input" value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="선택 입력"
              />
            </div>

            {/* FeSi 환율 */}
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
                        type="number" className="input pr-16" value={form.fesi_fx_rate}
                        onChange={e => setForm(f => ({ ...f, fesi_fx_rate: e.target.value }))}
                        placeholder={selectedContract?.reference_exchange_rate
                          ? `참고: ${fmtNum(selectedContract.reference_exchange_rate)}` : '예: 1,380'}
                        step="1"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원/USD</span>
                    </div>
                    {selectedContract?.reference_exchange_rate && (
                      <p className="mt-1 text-xs text-gray-400">
                        계약 참고환율: {fmtNum(selectedContract.reference_exchange_rate)}원
                        {form.fesi_fx_rate && parseFloat(form.fesi_fx_rate) !== selectedContract.reference_exchange_rate && (
                          <span className="ml-2 text-blue-600 font-medium">→ 입력 환율로 미리보기 반영 중</span>
                        )}
                      </p>
                    )}
                  </div>
                  {form.fesi_fx_rate && form.quantity_kg && selectedContract && (
                    <div className="text-sm">
                      <p className="text-xs text-gray-500 mb-1">환율 기준 원화 환산</p>
                      <p className="text-gray-700">
                        판매: <span className="font-semibold">{fmtNum(selectedContract.sell_price, 2)} USD/톤</span>
                        <span className="text-gray-400 ml-1">≈ {fmtNum(selectedContract.sell_price * parseFloat(form.fesi_fx_rate))}원</span>
                      </p>
                      <p className="text-gray-700 mt-0.5">
                        원가: <span className="font-semibold">{fmtNum(selectedContract.cost_price, 2)} USD/톤</span>
                        <span className="text-gray-400 ml-1">≈ {fmtNum(selectedContract.cost_price * parseFloat(form.fesi_fx_rate))}원</span>
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

      {/* 감가 — 소괴탄/분탄 전용 */}
      {isCoal && form.contract_id && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            감가 (선택) <span className="font-normal normal-case text-gray-400">— 자연 감량</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">감가 물량 (톤)</label>
              <div className="relative">
                <input
                  type="number" className="input pr-10" value={form.depreciation_ton}
                  onChange={e => setForm(f => ({ ...f, depreciation_ton: e.target.value }))}
                  placeholder="예: 2.000" step="0.001" min="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">톤</span>
              </div>
              {form.depreciation_ton && form.quantity_kg && (
                <p className="mt-1 text-xs text-gray-400">
                  실 청구 물량: <span className="font-medium text-gray-600">
                    {fmtNum(parseFloat(form.quantity_kg) - parseFloat(form.depreciation_ton || '0'), 3)}톤
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 추가 배분 / 부족분 */}
      {form.contract_id && (
        <div className="mb-5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox" checked={form.use_addl}
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
                <label className="label">추가 물량 (톤) *</label>
                <div className="relative">
                  <input
                    type="number" className="input pr-10" value={form.addl_quantity_kg}
                    onChange={e => setForm(f => ({ ...f, addl_quantity_kg: e.target.value }))}
                    placeholder="예: 20.000" step="0.001" min="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">톤</span>
                </div>
              </div>
              <div>
                <label className="label">추가 마진 단가 (원/톤) *<span className="text-gray-400 font-normal ml-1">화림 결정</span></label>
                <div className="relative">
                  <input
                    type="number" className="input pr-14" value={form.addl_margin_per_ton}
                    onChange={e => setForm(f => ({ ...f, addl_margin_per_ton: e.target.value }))}
                    placeholder="예: 5000" step="100"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원/톤</span>
                </div>
              </div>
              <p className="col-span-full text-xs text-gray-500">
                호진이 물량을 <strong>더</strong> 가져갈 때 — 화림→한국에이원 커미션 지급 (익월10일, 1/3 배분)
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer select-none mt-3">
            <input
              type="checkbox" checked={form.use_shortage}
              onChange={e => setForm(f => ({ ...f, use_shortage: e.target.checked, hoejin_shortage_kg: '', hoejin_shortage_price: '' }))}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm font-medium text-gray-700">
              부족분 처리 <span className="text-gray-400 font-normal">(덜 가져갈 때)</span>
            </span>
          </label>

          {form.use_shortage && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6 border-l-2 border-red-200">
              <div>
                <label className="label">부족 물량 (톤) *</label>
                <div className="relative">
                  <input
                    type="number" className="input pr-10" value={form.hoejin_shortage_kg}
                    onChange={e => setForm(f => ({ ...f, hoejin_shortage_kg: e.target.value }))}
                    placeholder="예: 5.000" step="0.001" min="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">톤</span>
                </div>
              </div>
              <div>
                <label className="label">화림 통보 단가 (원/톤) *</label>
                <div className="relative">
                  <input
                    type="number" className="input pr-14" value={form.hoejin_shortage_price}
                    onChange={e => setForm(f => ({ ...f, hoejin_shortage_price: e.target.value }))}
                    placeholder="예: 30000" step="100" min="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원/톤</span>
                </div>
              </div>
              {form.hoejin_shortage_kg && form.hoejin_shortage_price && (
                <div className="col-span-full bg-red-50 border border-red-100 rounded p-3">
                  <p className="text-xs text-red-600 font-medium">
                    한국에이원→호진 지급: {fmtKrw(parseFloat(form.hoejin_shortage_kg) * parseFloat(form.hoejin_shortage_price))}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">당월말 기준, 익월10일 지급</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 마진 미리보기 */}
      <MarginPreview
        mainMargin={mainMargin}
        addlMargin={addlMargin}
        combinedMargin={combinedMargin}
        isFeSi={isFeSi}
        fesiRateInput={form.fesi_fx_rate}
        contractForPreview={contractForPreview}
      />

      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

      <div className="flex gap-2">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : editDelivery ? '수정 저장' : '입고 등록'}
        </button>
        <button className="btn-secondary" onClick={onClose}>취소</button>
      </div>
    </div>
  )
}
