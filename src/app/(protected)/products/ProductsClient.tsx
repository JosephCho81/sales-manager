'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toMessage } from '@/lib/error'
import { upsertProduct, toggleProductActive } from './actions'
import type { Product, PriceUnit, VatType } from '@/types'
import ProductForm, {
  PRICE_UNITS, VAT_OPTIONS,
  DEFAULT_FORM, DEFAULT_CHAIN,
  type ProductFormState,
} from './ProductForm'

export default function ProductsClient({ initialProducts }: { initialProducts: Product[] }) {
  const router = useRouter()
  const [products, setProducts] = useState(initialProducts)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductFormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function openNew() {
    setEditId(null)
    setForm(DEFAULT_FORM)
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

    if (editId) {
      setProducts(prev => prev.map(p => p.id === editId ? result.data : p))
    } else {
      setProducts(prev => [...prev, result.data])
    }
  }

  async function toggleActive(p: Product) {
    try {
      await toggleProductActive(p.id, !p.is_active)
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !p.is_active } : x))
    } catch (e) {
      setError(toMessage(e))
    }
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

      {error && !showForm && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
      )}

      {showForm && (
        <ProductForm
          editId={editId}
          form={form}
          setForm={setForm}
          saving={saving}
          error={error}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setError('') }}
        />
      )}

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
