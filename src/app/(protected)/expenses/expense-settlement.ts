/**
 * 비용 정산 순수 계산·입력 검증 (React 비의존 — 단위 테스트 대상)
 * 3사(한국에이원/나성/금화) 1/3 균등 부담 기준으로 낼/받을 금액과 송금 매칭을 계산하고,
 * 저장 전 입력(날짜/내역/금액/지불업체)을 결정적으로 검증한다.
 */
import { EXPENSE_PAYERS, type Expense, type ExpensePayer } from '@/types'

export interface PayerSettlement {
  share: number
  paid: number
  /** share - paid: 양수면 더 내야 할 금액, 음수면 돌려받을 금액 */
  net: number
}

export interface Transfer {
  from: ExpensePayer
  to: ExpensePayer
  amount: number
}

/** 총액을 3등분 — 나머지(원 단위)는 금화에 귀속 */
export function splitExpense(total: number): Record<ExpensePayer, number> {
  const base = Math.floor(total / 3)
  return { korea_a1: base, raseong: base, geumhwa: total - base * 2 }
}

/** 미정산 행들로 업체별 부담/지불/차액을 계산 */
export function computeSettlement(unsettledRows: Expense[]): Record<ExpensePayer, PayerSettlement> {
  const total = unsettledRows.reduce((s, r) => s + r.amount, 0)
  const share = splitExpense(total)
  const paid: Record<ExpensePayer, number> = { korea_a1: 0, raseong: 0, geumhwa: 0 }
  for (const r of unsettledRows) {
    if (r.payer) paid[r.payer] += r.amount
  }
  return Object.fromEntries(
    EXPENSE_PAYERS.map(p => [p, { share: share[p], paid: paid[p], net: share[p] - paid[p] }])
  ) as Record<ExpensePayer, PayerSettlement>
}

/** 미정산 합계 중 지불 업체 미지정분 */
export function computeUnassignedTotal(unsettledRows: Expense[]): number {
  return unsettledRows.filter(r => !r.payer).reduce((s, r) => s + r.amount, 0)
}

// ── 입력 검증 ─────────────────────────────────────────────

export type Validation<T> = { ok: true; payload: T } | { ok: false; error: string }

interface ExpenseEditFields { date: string; description: string; amount: number }
interface ExpenseInsertFields extends ExpenseEditFields { payer: ExpensePayer }

/** 공통: 날짜/내역/금액(양의 정수) 검증 후 정제된 필드 반환 */
function validateCommon(date: string, description: string, amountRaw: string): Validation<ExpenseEditFields> {
  if (!date)               return { ok: false, error: '날짜를 입력하세요.' }
  if (!description.trim()) return { ok: false, error: '내역을 입력하세요.' }
  const amount = parseInt(amountRaw, 10)
  if (!amount || amount <= 0) return { ok: false, error: '금액을 올바르게 입력하세요.' }
  return { ok: true, payload: { date, description: description.trim(), amount } }
}

/** 신규 등록: 공통 + 지불 업체 필수 */
export function validateExpenseInput(
  date: string, description: string, amountRaw: string, payer: '' | ExpensePayer,
): Validation<ExpenseInsertFields> {
  const base = validateCommon(date, description, amountRaw)
  if (!base.ok) return base
  if (!payer) return { ok: false, error: '지불 업체를 선택하세요.' }
  return { ok: true, payload: { ...base.payload, payer } }
}

/** 수정: 공통만 (지불 업체는 행에서 별도 변경) */
export function validateExpenseEdit(
  date: string, description: string, amountRaw: string,
): Validation<ExpenseEditFields> {
  return validateCommon(date, description, amountRaw)
}

/**
 * 낼 금액(net>0) 업체가 받을 금액(net<0) 업체에게 송금 — 그리디 매칭.
 * 지불 업체 미지정분만큼 낼 금액 합이 받을 금액 합보다 클 수 있으며,
 * 그 잔여분은 송금 대상이 없어 제외된다.
 */
export function computeTransfers(settlement: Record<ExpensePayer, PayerSettlement>): Transfer[] {
  const debtors = EXPENSE_PAYERS
    .filter(p => settlement[p].net > 0)
    .map(p => ({ p, amt: settlement[p].net }))
  const creditors = EXPENSE_PAYERS
    .filter(p => settlement[p].net < 0)
    .map(p => ({ p, amt: -settlement[p].net }))
  const result: Transfer[] = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amt, creditors[j].amt)
    if (amount > 0) result.push({ from: debtors[i].p, to: creditors[j].p, amount })
    debtors[i].amt -= amount
    creditors[j].amt -= amount
    if (debtors[i].amt === 0) i++
    if (creditors[j].amt === 0) j++
  }
  return result
}
