'use client'

import type { VatType, PriceUnit } from '@/types'

export const BUYERS = ['동국제강', '현대제철', '기타']

export const PRICE_UNITS: { value: PriceUnit; label: string }[] = [
  { value: 'KRW_TON', label: '원/톤' },
  { value: 'USD_TON', label: 'USD/톤' },
  { value: 'KRW_KG',  label: '원/kg' },
]

export const VAT_OPTIONS: { value: VatType; label: string }[] = [
  { value: 'TEN_PERCENT', label: '10%' },
  { value: 'NONE',        label: '없음' },
]

export interface ChainStep {
  steps: string
  buy_from: string
  sell_to: string
  special: string
}

export interface ProductFormState {
  name: string
  display_name: string
  buyer: string
  unit: string
  price_unit: PriceUnit
  vat: VatType
  chain: ChainStep
  memo: string
}

export const DEFAULT_CHAIN: ChainStep = { steps: '', buy_from: '', sell_to: '', special: '' }

export const DEFAULT_FORM: ProductFormState = {
  name: '',
  display_name: '',
  buyer: '동국제강',
  unit: 'kg',
  price_unit: 'KRW_TON',
  vat: 'TEN_PERCENT',
  chain: DEFAULT_CHAIN,
  memo: '',
}

export default function ProductForm({
  editId,
  form,
  setForm,
  saving,
  error,
  onSave,
  onCancel,
}: {
  editId: string | null
  form: ProductFormState
  setForm: React.Dispatch<React.SetStateAction<ProductFormState>>
  saving: boolean
  error: string
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="card p-5 mb-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">
        {editId ? '품목 수정' : '새 품목 등록'}
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">품목 코드 *</label>
          <input
            className="input"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="예: AL35B"
          />
        </div>
        <div>
          <label className="label">표시명 *</label>
          <input
            className="input"
            value={form.display_name}
            onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
            placeholder="예: AL-35B"
          />
        </div>
        <div>
          <label className="label">납품처</label>
          <select className="input" value={form.buyer} onChange={e => setForm(f => ({ ...f, buyer: e.target.value }))}>
            {BUYERS.map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="label">단위</label>
          <input className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="kg" />
        </div>
        <div>
          <label className="label">단가 기준</label>
          <select className="input" value={form.price_unit} onChange={e => setForm(f => ({ ...f, price_unit: e.target.value as PriceUnit }))}>
            {PRICE_UNITS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">VAT</label>
          <select className="input" value={form.vat} onChange={e => setForm(f => ({ ...f, vat: e.target.value as VatType }))}>
            {VAT_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">거래 체인 (예: 동국제강 → (주)한국에이원 → 금화 → 화림)</label>
          <input
            className="input"
            value={form.chain.steps}
            onChange={e => setForm(f => ({ ...f, chain: { ...f.chain, steps: e.target.value } }))}
            placeholder="화살표(→ 또는 ->) 로 구분"
          />
        </div>
        <div>
          <label className="label">매입처</label>
          <input
            className="input"
            value={form.chain.buy_from}
            onChange={e => setForm(f => ({ ...f, chain: { ...f.chain, buy_from: e.target.value } }))}
            placeholder="예: 화림, EG, 렘코"
          />
        </div>
        <div>
          <label className="label">납품처 (체인 최종)</label>
          <input
            className="input"
            value={form.chain.sell_to}
            onChange={e => setForm(f => ({ ...f, chain: { ...f.chain, sell_to: e.target.value } }))}
            placeholder="예: 동국제강, 현대제철"
          />
        </div>
        <div>
          <label className="label">특이사항 코드</label>
          <input
            className="input"
            value={form.chain.special}
            onChange={e => setForm(f => ({ ...f, chain: { ...f.chain, special: e.target.value } }))}
            placeholder="예: hyundai, ferrosilicon, hoejin"
          />
        </div>
        <div>
          <label className="label">메모</label>
          <input className="input" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </button>
        <button className="btn-secondary" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}
