/**
 * 입고 저장 행 조립·검증 (순수 함수 — 서버 액션과 테스트가 공유)
 *
 * 매입단가가 2개인 품목(AL40·AL30·AL35B)은 같은 납품을 단가별로 2건 저장한다.
 * 예전엔 1건씩 따로 저장해 중복 저장을 막을 수 없었고, 청구월(invoice_month)을
 * 클라이언트가 계산해 보냈다. 여기서 계약 정보로 서버가 직접 만든다.
 */
import { monthEnd, monthStart, shiftMonths, toYearMonth } from '@/lib/date'

export type ContractForDelivery = {
  id: string
  product_id: string
  start_date: string
  end_date: string
  invoice_month_offset: number
}

export type DeliveryLineInput = { contractId: string; tons: string | number }

export type DeliveryInsertRow = {
  delivery_date: string
  year_month: string
  invoice_month: string
  product_id: string
  contract_id: string
  quantity_kg: number
  depreciation_amount: null
  memo: string | null
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** 톤 입력 → kg 정수. 0·음수·숫자 아님·소수 4자리 이상은 거부 */
export function parseTonsToKg(input: string | number): Result<number> {
  const raw = typeof input === 'number' ? String(input) : input.replace(/,/g, '').trim()
  if (!/^\d+(\.\d{1,3})?$/.test(raw)) {
    return { ok: false, error: '물량은 0보다 큰 숫자(소수 3자리까지)로 입력하세요.' }
  }
  const kg = Math.round(Number(raw) * 1000)
  if (!Number.isFinite(kg) || kg <= 0) return { ok: false, error: '물량은 0보다 커야 합니다.' }
  return { ok: true, value: kg }
}

/** 계약이 그 품목의 것이고 납품월과 기간이 겹치는지 — 입고 폼의 단가 목록과 같은 기준 */
export function contractCoversMonth(c: ContractForDelivery, productId: string, yearMonth: string): boolean {
  return c.product_id === productId && c.start_date <= monthEnd(yearMonth) && c.end_date >= monthStart(yearMonth)
}

export function deliveryMonths(deliveryDate: string, offset: number) {
  const year_month = toYearMonth(deliveryDate)
  return { year_month, invoice_month: shiftMonths(year_month, offset) }
}

/**
 * 같은 품목·납품월의 입고는 청구월이 하나여야 한다. 갈리면 analytics에서 한쪽이
 * 통째로 누락된다(CLAUDE.md: 매입단가 2개 품목의 invoice_month_offset은 같게).
 */
export function invoiceMonthConflict(invoiceMonths: string[]): string | null {
  const set = new Set(invoiceMonths)
  if (set.size <= 1) return null
  return `같은 품목·납품월의 청구월이 서로 다릅니다(${[...set].sort().join(', ')}). 낙찰 단가의 청구월 오프셋을 같게 맞춘 뒤 저장하세요.`
}

export function buildDeliveryRows(input: {
  deliveryDate: string
  productId: string
  lines: DeliveryLineInput[]
  memo: string | null
  contracts: ContractForDelivery[]
}): Result<DeliveryInsertRow[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deliveryDate)) return { ok: false, error: '입고 날짜가 올바르지 않습니다.' }
  if (!input.productId) return { ok: false, error: '품목을 선택하세요.' }
  if (input.lines.length === 0) return { ok: false, error: '물량을 입력한 낙찰 단가가 없습니다.' }

  const ids = input.lines.map(l => l.contractId)
  if (new Set(ids).size !== ids.length) return { ok: false, error: '같은 낙찰 단가가 두 번 들어 있습니다.' }

  const yearMonth = toYearMonth(input.deliveryDate)
  const rows: DeliveryInsertRow[] = []
  for (const line of input.lines) {
    const c = input.contracts.find(x => x.id === line.contractId)
    if (!c || !contractCoversMonth(c, input.productId, yearMonth)) {
      return { ok: false, error: `${yearMonth}에 유효하지 않은 낙찰 단가가 포함돼 있습니다. 새로고침 후 다시 시도하세요.` }
    }
    const kg = parseTonsToKg(line.tons)
    if (!kg.ok) return kg
    rows.push({
      delivery_date: input.deliveryDate,
      ...deliveryMonths(input.deliveryDate, c.invoice_month_offset),
      product_id: input.productId,
      contract_id: c.id,
      quantity_kg: kg.value,
      depreciation_amount: null,
      memo: input.memo?.trim() || null,
    })
  }

  const conflict = invoiceMonthConflict(rows.map(r => r.invoice_month))
  if (conflict) return { ok: false, error: conflict }
  return { ok: true, value: rows }
}

/**
 * 같은 품목·낙찰 단가·납품월에 이미 입고가 있는 줄. 월말 일괄 입력이라 정상이면 단가별 1건이다.
 * 추가분이 실제로 있을 수 있어 막지는 않고 확인을 받는다.
 */
export function duplicateLines<T extends { contract_id: string; year_month: string }>(
  existing: T[],
  rows: Array<{ contract_id: string; year_month: string }>,
): T[] {
  return existing.filter(e => rows.some(r => r.contract_id === e.contract_id && r.year_month === e.year_month))
}
