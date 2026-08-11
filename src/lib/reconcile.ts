import type { InvoiceRow } from '@/lib/invoice-generator'

/**
 * 실물 세금계산서 대사 — 생성값과 실물의 차이를 계산한다.
 * 순수 함수: 서버·클라이언트 양쪽에서 같은 판정을 쓰기 위해 분리했다.
 */

export type ReconcileDiff = {
  /** 실물 − 생성값 (양수 = 실물이 더 큼) */
  supply: number
  vat: number
  total: number
  /** 세 항목이 모두 0이면 일치 */
  matched: boolean
}

export function diffInvoice(inv: InvoiceRow): ReconcileDiff | null {
  if (inv.reconciled_at === null || inv.actual_supply_amount === null || inv.actual_vat_amount === null) {
    return null
  }
  const supply = Number(inv.actual_supply_amount) - Number(inv.supply_amount)
  const vat    = Number(inv.actual_vat_amount)    - Number(inv.vat_amount)
  const total  = supply + vat
  return { supply, vat, total, matched: supply === 0 && vat === 0 }
}

export type ReconcileSummary = {
  total: number
  reconciled: number
  matched: number
  mismatched: number
  /** 차이 나는 건들의 총액 합계 (부호 포함) */
  diffTotal: number
}

export function summarizeReconciliation(invoices: InvoiceRow[]): ReconcileSummary {
  let reconciled = 0, matched = 0, mismatched = 0, diffTotal = 0
  for (const inv of invoices) {
    const d = diffInvoice(inv)
    if (!d) continue
    reconciled++
    if (d.matched) matched++
    else { mismatched++; diffTotal += d.total }
  }
  return { total: invoices.length, reconciled, matched, mismatched, diffTotal }
}

/**
 * 금액 입력 파싱 — "1,234,567" / " 1234567 " 모두 허용, 그 외는 거부.
 * 실물 계산서를 보고 옮겨 적는 값이라 소수점·음수는 입력 실수로 본다.
 */
export function parseAmountInput(raw: string | number | null | undefined): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { ok: false, error: '금액을 입력하세요.' }
  }
  const cleaned = String(raw).replace(/[,\s]/g, '')
  if (!/^\d+$/.test(cleaned)) {
    return { ok: false, error: '금액은 0 이상의 정수(원)로 입력하세요.' }
  }
  const value = Number(cleaned)
  if (!Number.isSafeInteger(value)) return { ok: false, error: '금액이 너무 큽니다.' }
  return { ok: true, value }
}
