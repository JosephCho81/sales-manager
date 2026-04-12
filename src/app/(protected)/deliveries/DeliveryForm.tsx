'use client'

import { useDeliveryForm } from './useDeliveryForm'
import { fmtKrw, fmtNum } from '@/lib/margin'
import { toYearMonth } from '@/lib/date'
import type { ProductRow, ContractRow, DeliveryRow } from './types'
import MarginPreview from './MarginPreview'

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
  const {
    form, setForm,
    saving, error,
    selectedProduct, isFeSi, isCoal, formYearMonth,
    availableContracts, selectedContract, contractForPreview, mainMargin,
    handleSave,
  } = useDeliveryForm({ products, contracts, editDelivery, defaultYearMonth, onSaved })

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
            감가 (선택) <span className="font-normal normal-case text-gray-400">— 동국제강 지정 감가금액</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">감가 금액 (원)</label>
              <div className="relative">
                <input
                  type="number" className="input pr-10" value={form.depreciation_amount}
                  onChange={e => setForm(f => ({ ...f, depreciation_amount: e.target.value }))}
                  placeholder="예: 50000" step="1" min="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원</span>
              </div>
              {form.depreciation_amount && (
                <p className="mt-1 text-xs text-gray-400">
                  렘코·동창 동일 적용: <span className="font-medium text-gray-600">
                    -{fmtKrw(parseFloat(form.depreciation_amount || '0'))}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 마진 미리보기 */}
      <MarginPreview
        mainMargin={mainMargin}
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
