'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { upsertProduct, toggleProductActive } from './actions'
import type { Product, VatType, PriceUnit } from '@/types'

const BUYERS = ['동국제강', '현대제철', '기타']
const PRICE_UNITS: { value: PriceUnit; label: string }[] = [
  { value: 'KRW_TON', label: '원/톤' },
  { value: 'USD_TON', label: 'USD/톤' },
  { value: 'KRW_KG',  label: '원/kg' },
]
const VAT_OPTIONS: { value: VatType; label: string }[] = [
  { value: 'TEN_PERCENT', label: '10%' },
  { value: 'NONE',        label: '없음' },
]

interface ChainStep {
  steps: string
  buy_from: string
  sell_to: string
  special: string
}

const defaultChain: ChainStep = { steps: '', buy_from: '', sell_to: '', special: '' }

interface FormState {
  name: string
  display_name: string
  buyer: string
  unit: string
  price_unit: PriceUnit
  vat: VatType
  chain: ChainStep
  memo: string
}

const defaultForm: FormState = {
  name: '',
  display_name: '',
  buyer: '동국제강',
  unit: 'kg',
  price_unit: 'KRW_TON',
  vat: 'TEN_PERCENT',
  chain: defaultChain,
  memo: '',
}

export default function ProductsClient({ initialProducts }: { initialProducts: Product[] }) {
  const router = useRouter()
  const [products, setProducts] = useState(initialProducts)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function openNew() {
    setEditId(null)
    setForm(defaultForm)
    setError('')
    setShowForm(true)
  }

  function openEdit(p: Product) {
    setEditId(p.id)
    setForm({
      name: p.name,
      display_name: p.display_name,
      buyer: p.buyer,
      unit: p.unit,
      price_unit: p.price_unit as PriceUnit,
      vat: p.vat as VatType,
      chain: {
        steps: Array.isArray(p.chain?.steps) ? p.chain.steps.join(' → ') : '',
        buy_from: p.chain?.buy_from ?? '',
        sell_to: p.chain?.sell_to ?? '',
        special: p.chain?.special ?? '',
      },
      memo: p.memo ?? '',
    })
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name || !form.display_name) {
      setError('품목 코드와 표시명은 필수입니다.')
      return
    }
    setSaving(true)
    setError('')

    const payload = {
      name: form.name.toUpperCase().replace(/\s/g, ''),
      display_name: form.display_name,
      buyer: form.buyer,
      unit: form.unit,
      price_unit: form.price_unit,
      vat: form.vat,
      chain: {
        steps: form.chain.steps.split(/→|->/).map(s => s.trim()).filter(Boolean),
        buy_from: form.chain.buy_from,
        sell_to: form.chain.sell_to,
        special: form.chain.special || undefined,
      },
      memo: form.memo || null,
      is_active: true,
    }

    const result = await upsertProduct(payload, editId ?? undefined)

    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }

    router.refresh()
    setShowForm(false)
    setSaving(false)

    // 로컬 상태 업데이트
    if (editId) {
      setProducts(prev => prev.map(p => p.id === editId ? result.data : p))
    } else {
      setProducts(prev => [...prev, result.data])
    }
  }

  async function toggleActive(p: Product) {
    await toggleProductActive(p.id, !p.is_active)
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !p.is_active } : x))
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">품목 설정</h2>
          <p className="text-sm text-gray-500 mt-0.5">총 {products.length}개 품목</p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ 품목 추가</button>
      </div>

      {/* 폼 */}
      {showForm && (
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
              <label className="label">거래 체인 (예: 동국제강 → 한국에이원 → 금화 → 화림)</label>
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
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">코드</th>
              <th className="table-th">표시명</th>
              <th className="table-th">납품처</th>
              <th className="table-th">단가 기준</th>
              <th className="table-th">VAT</th>
              <th className="table-th">거래 체인</th>
              <th className="table-th">상태</th>
              <th className="table-th">관리</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="table-td text-center text-gray-400 py-8">
                  등록된 품목이 없습니다.
                </td>
              </tr>
            )}
            {products.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="table-td font-mono text-xs">{p.name}</td>
                <td className="table-td font-medium">{p.display_name}</td>
                <td className="table-td text-gray-500">{p.buyer}</td>
                <td className="table-td text-gray-500">{
                  PRICE_UNITS.find(u => u.value === p.price_unit)?.label
                }</td>
                <td className="table-td text-gray-500">{
                  VAT_OPTIONS.find(v => v.value === p.vat)?.label
                }</td>
                <td className="table-td text-xs text-gray-400 max-w-xs truncate">
                  {Array.isArray(p.chain?.steps) ? p.chain.steps.join(' → ') : ''}
                </td>
                <td className="table-td">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {p.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="table-td">
                  <div className="flex gap-2">
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => openEdit(p)}
                    >수정</button>
                    <button
                      className="text-xs text-gray-500 hover:underline"
                      onClick={() => toggleActive(p)}
                    >{p.is_active ? '비활성화' : '활성화'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
