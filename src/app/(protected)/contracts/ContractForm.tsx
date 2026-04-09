'use client'

import { useState, useMemo } from 'react'
import { upsertContract } from './actions'
import { fmtNum } from '@/lib/margin'
import type { Product } from '@/types'
import type { ContractRow, ContractFormState as FormState } from './types'

const defaultForm: FormState = {
  product_id: '', start_date: '', end_date: '',
  sell_price: '', cost_price: '',
  reference_exchange_rate: '',
  exchange_rate_basis: 'BL 날짜 기준 동국제강 지정 환율',
  memo: '',
}

function formFromContract(c: ContractRow): FormState {
  return {
    product_id: c.product_id,
    start_date: c.start_date.slice(0, 10),
    end_date: c.end_date.slice(0, 10),
    sell_price: String(c.sell_price),
    cost_price: String(c.cost_price),
    reference_exchange_rate: c.reference_exchange_rate ? String(c.reference_exchange_rate) : '',
    exchange_rate_basis: c.exchange_rate_basis ?? 'BL 날짜 기준 동국제강 지정 환율',
    memo: c.memo ?? '',
  }
}

// ────────────────────────────────────────────────────────
// ContractForm
//   editContract: null = 새 등록, ContractRow = 수정
// ────────────────────────────────────────────────────────
export default function ContractForm({
  products,
  editContract,
  existingContracts,
  onClose,
  onSaved,
}: {
  products: Product[]
  editContract: ContractRow | null
  existingContracts: ContractRow[]
  onClose: () => void
  onSaved: (saved: ContractRow) => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    editContract ? formFromContract(editContract) : defaultForm
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedProduct = useMemo(
    () => products.find(p => p.id === form.product_id) ?? null,
    [products, form.product_id]
  )
  const isUsd = selectedProduct?.price_unit === 'USD_TON'

  const marginPreview = useMemo(() => {
    const sell = parseFloat(form.sell_price)
    const cost = parseFloat(form.cost_price)
    if (!sell || !cost) return null
    if (isUsd) {
      const rate = parseFloat(form.reference_exchange_rate)
      if (!rate) return null
      const marginUsd = sell - cost
      return { margin: marginUsd * rate, marginUsd, sellKrw: sell * rate, costKrw: cost * rate, rate }
    }
    return { margin: sell - cost, marginUsd: null, sellKrw: null, costKrw: null, rate: null }
  }, [form.sell_price, form.cost_price, form.reference_exchange_rate, isUsd])

  async function handleSave() {
    if (!form.product_id) { setError('품목을 선택하세요.'); return }
    if (!form.start_date || !form.end_date) { setError('낙찰 기간을 입력하세요.'); return }
    if (form.start_date >= form.end_date) { setError('종료일은 시작일보다 이후여야 합니다.'); return }
    if (!form.sell_price || isNaN(parseFloat(form.sell_price))) { setError('판매단가를 입력하세요.'); return }
    if (!form.cost_price || isNaN(parseFloat(form.cost_price))) { setError('원가단가를 입력하세요.'); return }
    if (isUsd && (!form.reference_exchange_rate || isNaN(parseFloat(form.reference_exchange_rate)))) {
      setError('FeSi 품목은 참고 환율을 입력해야 합니다.')
      return
    }

    const overlapping = existingContracts.filter(c => {
      if (c.product_id !== form.product_id) return false
      if (editContract && c.id === editContract.id) return false
      return form.start_date < c.end_date && form.end_date > c.start_date
    })
    if (overlapping.length > 0) {
      const o = overlapping[0]
      setError(`기간이 겹칩니다: 기존 "${o.start_date} ~ ${o.end_date}" 계약과 충돌합니다.`)
      return
    }

    setSaving(true); setError('')
    const payload = {
      product_id: form.product_id,
      start_date: form.start_date,
      end_date: form.end_date,
      sell_price: parseFloat(form.sell_price),
      cost_price: parseFloat(form.cost_price),
      currency: isUsd ? 'USD' : 'KRW',
      reference_exchange_rate: isUsd ? parseFloat(form.reference_exchange_rate) : null,
      exchange_rate_basis: isUsd ? (form.exchange_rate_basis || null) : null,
      memo: form.memo || null,
    }
    const result = await upsertContract(payload, editContract?.id)
    if (result.error) { setError(result.error); setSaving(false); return }
    onSaved(result.data as unknown as ContractRow)
  }

  return (
    <div className="card p-5 mb-6 border-blue-200 border-2">
      <h3 className="text-sm font-semibold text-gray-900 mb-5">
        {editContract ? '낙찰 단가 수정' : '새 낙찰 단가 등록'}
        {isUsd && (
          <span className="ml-2 text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            FeSi — USD 거래
          </span>
        )}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 품목 선택 */}
        <div className="md:col-span-2">
          <label className="label">품목 *</label>
          <select
            className="input" value={form.product_id}
            onChange={e => setForm(f => ({ ...f, product_id: e.target.value, sell_price: '', cost_price: '', reference_exchange_rate: '' }))}
          >
            <option value="">품목을 선택하세요</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.display_name}{p.price_unit === 'USD_TON' ? ' (USD 거래)' : ''} — {p.buyer}
              </option>
            ))}
          </select>
        </div>

        {/* 낙찰 기간 */}
        <div>
          <label className="label">낙찰 시작일 *</label>
          <input type="date" className="input" value={form.start_date}
            onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
        </div>
        <div>
          <label className="label">낙찰 종료일 * <span className="text-gray-400 font-normal">(마지막 날 포함)</span></label>
          <input type="date" className="input" value={form.end_date}
            onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
        </div>

        {/* KRW 단가 */}
        {!isUsd && form.product_id && (
          <>
            <div>
              <label className="label">판매단가 * <span className="text-gray-400 font-normal">(원/톤)</span></label>
              <input type="number" className="input" value={form.sell_price}
                onChange={e => setForm(f => ({ ...f, sell_price: e.target.value }))}
                placeholder="예: 1,850,000" step="100" />
              <p className="mt-1 text-xs text-gray-400">동국제강 / 현대제철 납품 단가</p>
            </div>
            <div>
              <label className="label">원가단가 * <span className="text-gray-400 font-normal">(원/톤)</span></label>
              <input type="number" className="input" value={form.cost_price}
                onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
                placeholder="예: 1,800,000" step="100" />
              <p className="mt-1 text-xs text-gray-400">화림 / 렘코 / 동창 매입 단가</p>
            </div>
          </>
        )}

        {/* FeSi USD 단가 */}
        {isUsd && (
          <>
            <div>
              <label className="label">판매단가 * <span className="text-gray-400 font-normal">(USD/톤)</span></label>
              <div className="relative">
                <input type="number" className="input pr-16" value={form.sell_price}
                  onChange={e => setForm(f => ({ ...f, sell_price: e.target.value }))}
                  placeholder="예: 1,450.00" step="0.01" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">USD/톤</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">동국제강 납품 단가 (USD)</p>
            </div>
            <div>
              <label className="label">원가단가 * <span className="text-gray-400 font-normal">(USD/톤)</span></label>
              <div className="relative">
                <input type="number" className="input pr-16" value={form.cost_price}
                  onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
                  placeholder="예: 1,250.00" step="0.01" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">USD/톤</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">EG 매입 단가 (USD)</p>
            </div>
            <div>
              <label className="label">참고 환율 * <span className="text-gray-400 font-normal">(원/USD)</span></label>
              <div className="relative">
                <input type="number" className="input pr-16" value={form.reference_exchange_rate}
                  onChange={e => setForm(f => ({ ...f, reference_exchange_rate: e.target.value }))}
                  placeholder="예: 1,350" step="1" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원/USD</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">계약 시점 참고값 (실제 정산: BL 날짜 기준 환율)</p>
            </div>
            <div>
              <label className="label">환율 기준 설명</label>
              <input className="input" value={form.exchange_rate_basis}
                onChange={e => setForm(f => ({ ...f, exchange_rate_basis: e.target.value }))}
                placeholder="예: BL 날짜 기준 동국제강 지정 환율" />
            </div>
          </>
        )}

        {/* 메모 */}
        <div className="md:col-span-2">
          <label className="label">메모</label>
          <input className="input" value={form.memo}
            onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
            placeholder="선택 사항" />
        </div>
      </div>

      {/* 마진 미리보기 */}
      {marginPreview && form.product_id && (
        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 p-4">
          <p className="text-xs font-semibold text-blue-700 mb-3">마진 단가 미리보기</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">판매단가</p>
              {isUsd && marginPreview.sellKrw != null ? (
                <p className="font-semibold">
                  {fmtNum(parseFloat(form.sell_price), 2)} USD/톤
                  <br />
                  <span className="text-gray-400 text-xs">≈ {fmtNum(marginPreview.sellKrw)} 원/톤</span>
                </p>
              ) : (
                <p className="font-semibold">{fmtNum(parseFloat(form.sell_price))} 원/톤</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">원가단가</p>
              {isUsd && marginPreview.costKrw != null ? (
                <p className="font-semibold">
                  {fmtNum(parseFloat(form.cost_price), 2)} USD/톤
                  <br />
                  <span className="text-gray-400 text-xs">≈ {fmtNum(marginPreview.costKrw)} 원/톤</span>
                </p>
              ) : (
                <p className="font-semibold">{fmtNum(parseFloat(form.cost_price))} 원/톤</p>
              )}
            </div>
            {isUsd && marginPreview.rate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">참고 환율</p>
                <p className="font-semibold">{fmtNum(marginPreview.rate)} 원/USD</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-0.5">마진 단가</p>
              {isUsd && marginPreview.marginUsd != null ? (
                <p className={`font-bold ${marginPreview.margin >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  {fmtNum(marginPreview.marginUsd, 2)} USD/톤
                  <br />
                  <span className="text-lg">{fmtNum(marginPreview.margin)} 원/톤</span>
                </p>
              ) : (
                <p className={`text-lg font-bold ${marginPreview.margin >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  {fmtNum(marginPreview.margin)} 원/톤
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-blue-100 grid grid-cols-3 gap-2 text-xs text-gray-600">
            <div>한국에이원: <span className="font-medium text-green-700">{fmtNum(Math.floor(marginPreview.margin / 3))} 원/톤</span></div>
            <div>금화: <span className="font-medium text-purple-700">{fmtNum(Math.floor(marginPreview.margin / 3))} 원/톤</span></div>
            <div>라성: <span className="font-medium text-orange-700">{fmtNum(marginPreview.margin - Math.floor(marginPreview.margin / 3) * 2)} 원/톤</span></div>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : editContract ? '수정 저장' : '등록'}
        </button>
        <button className="btn-secondary" onClick={onClose}>취소</button>
      </div>
    </div>
  )
}
