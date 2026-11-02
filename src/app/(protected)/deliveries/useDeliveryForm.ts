'use client'

import { useState, useMemo } from 'react'
import { calcMarginFromContract } from '@/lib/margin'
import { getTodayDate, toYearMonth, monthStart, monthEnd } from '@/lib/date'
import { parseTonsToKg } from '@/lib/delivery-batch'
import { createDeliveries, updateDelivery, upsertFxRate, type DuplicateDelivery } from './actions'
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
    quantity_kg: (d.quantity_kg / 1000).toFixed(3),
    fesi_fx_rate: d.fx_rate ? String(d.fx_rate) : '',
    depreciation_amount: d.depreciation_amount ? String(d.depreciation_amount) : '',
    memo: d.memo ?? '',
  }
}

/** 월말 일괄 입력의 기본 날짜 — 조회 중인 달의 말일 */
function lastDayOf(yearMonth: string): string {
  return monthEnd(yearMonth).slice(0, 10)
}

export type PreviewLine = {
  contract: ContractRow
  margin: ReturnType<typeof calcMarginFromContract>
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
  onSaved: (saved: DeliveryRow[]) => void
}) {
  const isEdit = editDelivery !== null
  const [form, setForm] = useState<FormState>(() =>
    editDelivery ? formFromDelivery(editDelivery) : makeEmptyForm(lastDayOf(defaultYearMonth))
  )
  // 새 입고: 낙찰 단가별 물량(톤). 매입단가 2개 품목을 한 번에 저장하기 위함
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [duplicates, setDuplicates] = useState<DuplicateDelivery[] | null>(null)

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

  const withFx = useMemo(() => (c: ContractRow): ContractRow => {
    if (isFeSi && c.currency === 'USD' && form.fesi_fx_rate) {
      const rate = parseFloat(form.fesi_fx_rate)
      if (rate > 0) return { ...c, reference_exchange_rate: rate }
    }
    return c
  }, [isFeSi, form.fesi_fx_rate])

  // 미리보기 대상 줄 — 수정은 선택한 1건, 새 입고는 물량을 넣은 단가 전부
  const previewLines: PreviewLine[] = useMemo(() => {
    const pairs: Array<[ContractRow, string]> = isEdit
      ? (selectedContract ? [[selectedContract, form.quantity_kg]] : [])
      : availableContracts.map(c => [c, quantities[c.id] ?? ''])
    const out: PreviewLine[] = []
    for (const [c, tons] of pairs) {
      const kg = tons ? parseTonsToKg(tons) : null
      if (!kg?.ok) continue
      try {
        out.push({ contract: withFx(c), margin: calcMarginFromContract(withFx(c), kg.value) })
      } catch { /* USD 환율 없음 — MarginPreview가 안내 */ }
    }
    return out
  }, [isEdit, selectedContract, form.quantity_kg, availableContracts, quantities, withFx])

  // 수정 화면의 과거 건별 감가 표시 (새 값은 서버가 거부)
  const mainMargin = useMemo(() => {
    const line = previewLines.length === 1 ? previewLines[0] : null
    if (!line) return null
    const m = line.margin
    const dep = isEdit && isCoal && form.depreciation_amount ? parseFloat(form.depreciation_amount) : 0
    if (!dep) return m
    return {
      ...m,
      sell_price_krw_total: m.sell_price_krw * m.quantity_ton - dep,
      cost_price_krw_total: m.cost_price_krw * m.quantity_ton - dep,
      depreciation_amount: dep,
    }
  }, [previewLines, isEdit, isCoal, form.depreciation_amount])

  const contractForPreview = previewLines.length === 1 ? previewLines[0].contract : (selectedContract ? withFx(selectedContract) : null)

  async function saveFxRate(): Promise<number | null | false> {
    if (!(isFeSi && form.fesi_fx_rate)) return null
    const rate = parseFloat(form.fesi_fx_rate)
    if (!(rate > 0)) return null
    const fxResult = await upsertFxRate(form.product_id, form.delivery_date, rate)
    if (fxResult.error) { setError(`환율 저장 실패: ${fxResult.error}`); return false }
    return rate
  }

  async function handleSave(confirmDuplicate = false) {
    if (!form.delivery_date) { setError('입고 날짜를 입력하세요.'); return }
    if (!form.product_id)    { setError('품목을 선택하세요.'); return }

    if (isEdit) {
      if (!form.contract_id) { setError('낙찰 단가를 선택하세요.'); return }
      const kg = parseTonsToKg(form.quantity_kg)
      if (!kg.ok) { setError(kg.error); return }
    } else {
      const lines = availableContracts.filter(c => (quantities[c.id] ?? '').trim() !== '')
      if (lines.length === 0) { setError('물량(톤)을 입력하세요.'); return }
      for (const c of lines) {
        const kg = parseTonsToKg(quantities[c.id])
        if (!kg.ok) { setError(kg.error); return }
      }
    }

    setSaving(true); setError('')
    try {
      const fx = await saveFxRate()
      if (fx === false) return

      if (isEdit) {
        if (!editDelivery.updated_at) {
          setError('수정 대상 정보가 오래됐습니다. 새로고침 후 다시 시도하세요.')
          return
        }
        const result = await updateDelivery(
          { id: editDelivery.id, updatedAt: editDelivery.updated_at },
          {
            deliveryDate: form.delivery_date,
            contractId: form.contract_id,
            tons: form.quantity_kg,
            depreciationAmount: isCoal && form.depreciation_amount ? parseFloat(form.depreciation_amount) : null,
            memo: form.memo || null,
          },
        )
        if (result.error) { setError(result.error); return }
        onSaved([{ ...(result.data as unknown as DeliveryRow), fx_rate: fx }])
        return
      }

      const result = await createDeliveries({
        deliveryDate: form.delivery_date,
        productId: form.product_id,
        lines: availableContracts
          .filter(c => (quantities[c.id] ?? '').trim() !== '')
          .map(c => ({ contractId: c.id, tons: quantities[c.id] })),
        memo: form.memo || null,
      }, confirmDuplicate)
      if (result.error) { setError(result.error); return }
      if (result.duplicates) { setDuplicates(result.duplicates); return }
      setDuplicates(null)
      onSaved((result.data ?? []).map(d => ({ ...(d as unknown as DeliveryRow), fx_rate: fx })))
    } finally {
      setSaving(false)
    }
  }

  return {
    form, setForm,
    quantities, setQuantities,
    saving, error,
    duplicates, clearDuplicates: () => setDuplicates(null),
    isEdit,
    selectedProduct, isFeSi, isCoal, formYearMonth,
    availableContracts, selectedContract, contractForPreview, mainMargin, previewLines,
    handleSave,
  }
}
