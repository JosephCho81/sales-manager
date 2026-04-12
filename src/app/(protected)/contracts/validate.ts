import type { ContractFormState, ContractRow } from './types'

/**
 * 계약 폼 유효성 검사.
 * 오류 메시지를 반환하거나, 유효하면 null 반환.
 */
export function validateContract(
  form: ContractFormState,
  isUsd: boolean,
  existingContracts: ContractRow[],
  editId?: string
): string | null {
  if (!form.product_id) return '품목을 선택하세요.'
  if (!form.start_date || !form.end_date) return '낙찰 기간을 입력하세요.'
  if (form.start_date >= form.end_date) return '종료일은 시작일보다 이후여야 합니다.'
  if (!form.sell_price || isNaN(parseFloat(form.sell_price))) return '판매단가를 입력하세요.'
  if (!form.cost_price || isNaN(parseFloat(form.cost_price))) return '원가단가를 입력하세요.'
  if (isUsd && (!form.reference_exchange_rate || isNaN(parseFloat(form.reference_exchange_rate)))) {
    return 'FeSi 품목은 참고 환율을 입력해야 합니다.'
  }

  const overlapping = existingContracts.filter(c => {
    if (c.product_id !== form.product_id) return false
    if (editId && c.id === editId) return false
    return form.start_date < c.end_date && form.end_date > c.start_date
  })
  if (overlapping.length > 0) {
    const o = overlapping[0]
    return `기간이 겹칩니다: 기존 "${o.start_date} ~ ${o.end_date}" 계약과 충돌합니다.`
  }

  return null
}
