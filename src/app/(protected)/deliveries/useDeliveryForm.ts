'use client'

import { useState, useMemo } from 'react'
import { calcMarginFromContract } from '@/lib/margin'
import { getTodayDate, toYearMonth, monthStart, monthEnd, shiftMonths } from '@/lib/date'
import { upsertDelivery, upsertFxRate } from './actions'
import type { ProductRow, ContractRow, DeliveryRow, FormState } from './types'

function makeEmptyForm(defaultDate?: string): FormState {
  return {
    delivery_date: defaultDate ?? getTodayDate(),
    product_id: '', contract_id: '', quantity_kg: '', fesi_fx_rate: '',
    depreciation_amount: '',
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
    depreciation_amount: d.depreciation_amount ? String(d.depreciation_amount) : '',
    memo: d.memo ?? '',
  }
}

export function useDeliveryForm({
  products,
  contracts,
  editDelivery,
  defaultYearMonth,
  onSaved,
}: {
  products: ProductRow[]
  contracts: ContractRow[]
  editDelivery: DeliveryRow | null
  defaultYearMonth: string
  onSaved: (saved: DeliveryRow) => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    editDelivery ? formFromDelivery(editDelivery) : makeEmptyForm(`${defaultYearMonth}-01`)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  // useMemo로 입력마다 과도한 재계산 방지
  const mainMargin = useMemo(() => {
    if (!contractForPreview) return null
    const qty = parseFloat(form.quantity_kg)
    if (!qty || qty <= 0) return null
    try {
      const m   = calcMarginFromContract(contractForPreview, qty * 1000)
      const dep = isCoal && form.depreciation_amount ? parseFloat(form.depreciation_amount) : 0
      if (!dep) return m
      // 감가: 매출·매입 표시금액에서 차감 (마진은 양쪽 상쇄로 불변)
      return {
        ...m,
        sell_price_krw_total: m.sell_price_krw * m.quantity_ton - dep,
        cost_price_krw_total: m.cost_price_krw * m.quantity_ton - dep,
        depreciation_amount: dep,
      }
    } catch {
      return null
    }
  }, [contractForPreview, form.quantity_kg, isCoal, form.depreciation_amount])

  async function handleSave() {
    if (!form.delivery_date) { setError('입고 날짜를 입력하세요.'); return }
    if (!form.product_id)    { setError('품목을 선택하세요.'); return }
    if (!form.contract_id)   { setError('낙찰 단가를 선택하세요.'); return }
    const qty = parseFloat(form.quantity_kg)
    if (!qty || qty <= 0)    { setError('물량(톤)을 입력하세요.'); return }
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
      depreciation_amount: isCoal && form.depreciation_amount
        ? parseFloat(form.depreciation_amount) : null,
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

  return {
    form, setForm,
    saving, error,
    selectedProduct, isFeSi, isCoal, formYearMonth,
    availableContracts, selectedContract, contractForPreview, mainMargin,
    handleSave,
  }
}
