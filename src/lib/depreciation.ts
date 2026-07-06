/**
 * 월별 감가 (분탄 렘코 미수) — 입력 검증·누계 계산 순수 함수
 * 돈 입력은 결정적 검증: 음수/0/소수/비숫자 거부, 월 형식 강제
 */

export type MonthlyDepInputRaw = {
  year_month: string
  amount: string | number
  memo?: string | null
}

export type ParsedMonthlyDep =
  | { ok: true; year_month: string; amount: number; memo: string | null }
  | { ok: false; error: string }

export function parseMonthlyDepInput(raw: MonthlyDepInputRaw): ParsedMonthlyDep {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.year_month)) {
    return { ok: false, error: '월 형식이 잘못되었습니다 (YYYY-MM).' }
  }
  const amount = typeof raw.amount === 'number'
    ? raw.amount
    : Number(String(raw.amount).replace(/,/g, '').trim() || NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: '감가 금액은 0보다 큰 숫자여야 합니다.' }
  }
  if (!Number.isInteger(amount)) {
    return { ok: false, error: '감가 금액은 원 단위 정수여야 합니다.' }
  }
  return { ok: true, year_month: raw.year_month, amount, memo: raw.memo?.trim() || null }
}

export function sumUnsettled(deps: Array<{ amount: number; settled_at: string | null }>): number {
  return deps
    .filter(d => d.settled_at === null)
    .reduce((s, d) => s + Number(d.amount), 0)
}
