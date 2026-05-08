'use client'

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react'
import { upsertContract } from './actions'
import { validateContract } from './validate'
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

interface ContractFormReturn {
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
  saving: boolean
  error: string
  isUsd: boolean
  marginPreview: {
    margin: number
    marginUsd: number | null
    sellKrw: number | null
    costKrw: number | null
    rate: number | null
  } | null
  handleSave: () => Promise<void>
}

export function useContractForm({
  products,
  editContract,
  existingContracts,
  onSaved,
}: {
  products: Product[]
  editContract: ContractRow | null
  existingContracts: ContractRow[]
  onSaved: (saved: ContractRow) => void
}): ContractFormReturn {
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
    const validationError = validateContract(form, isUsd, existingContracts, editContract?.id)
    if (validationError) { setError(validationError); return }

    setSaving(true); setError('')
    // 같은 품목의 기존 계약에서 invoice_month_offset을 상속
    const sibling = existingContracts.find(
      c => c.product_id === form.product_id && c.id !== editContract?.id
    )
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
      invoice_month_offset: sibling?.invoice_month_offset ?? 0,
    }
    const result = await upsertContract(payload, editContract?.id)
    if (result.error) { setError(result.error); setSaving(false); return }
    onSaved(result.data as unknown as ContractRow)
  }

  return { form, setForm, saving, error, isUsd, marginPreview, handleSave }
}
