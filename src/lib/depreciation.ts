/**
 * 월별 감가 — 입력 검증·누계·계산서 배지 판정 순수 함수
 * 돈 입력은 결정적 검증: 음수/0/소수/비숫자 거부, 월 형식 강제
 *
 * 감가 두 유형 (혼동 시 이중 차감으로 이어짐 — docs/al30-depreciation-2026-05.md)
 *   보관형(hold)        : 매입만 차감, 매출 총액 유지 → 감가액이 통장에 남음 (분탄, 렘코 반환)
 *   통과형(passthrough) : 매출 계산서가 감액 발행(현대 통보 없이)되고 나중 매입에서 회수
 *                         → 매출·마진·커미션이 그달에 줄고, 회수월에 되돌아옴 (AL30, 화림 회수)
 */
import type { MonthlyDepreciation } from '@/types'

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export type MonthlyDepInputRaw = {
  year_month: string
  amount: string | number
  memo?: string | null
  /** 매출 입금이 감액된 납품월. null = 매출 영향 없음(보관형) */
  sales_deduct_ym?: string | null
  /** 매입 계산서에서 차감할 납품월. 미지정 시 year_month(당월 차감) */
  cost_deduct_ym?: string | null
}

export type ParsedMonthlyDep =
  | {
      ok: true
      year_month: string
      amount: number
      memo: string | null
      sales_deduct_ym: string | null
      cost_deduct_ym: string
    }
  | { ok: false; error: string }

export function parseMonthlyDepInput(raw: MonthlyDepInputRaw): ParsedMonthlyDep {
  if (!YM_RE.test(raw.year_month)) {
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

  const sales = raw.sales_deduct_ym?.trim() || null
  if (sales !== null && !YM_RE.test(sales)) {
    return { ok: false, error: '매출 감액월 형식이 잘못되었습니다 (YYYY-MM).' }
  }
  // 미지정 = 당월 매입 차감(분탄 기존 동작)
  const cost = raw.cost_deduct_ym?.trim() || raw.year_month
  if (!YM_RE.test(cost)) {
    return { ok: false, error: '매입 차감월 형식이 잘못되었습니다 (YYYY-MM).' }
  }

  return {
    ok: true,
    year_month: raw.year_month,
    amount,
    memo: raw.memo?.trim() || null,
    sales_deduct_ym: sales,
    cost_deduct_ym: cost,
  }
}

// ── 유형 판정 ──────────────────────────────────────────────

export type DepKind = 'hold' | 'passthrough'

/** 매출 입금이 줄었으면 통과형(회수 대상), 아니면 보관형 */
export function depKind(d: Pick<MonthlyDepreciation, 'sales_deduct_ym'>): DepKind {
  return d.sales_deduct_ym ? 'passthrough' : 'hold'
}

/** 보관형 미정산 누계 (렘코 반환 예정액) */
export function sumUnsettled(
  deps: Array<Pick<MonthlyDepreciation, 'amount' | 'settled_at' | 'sales_deduct_ym'>>,
): number {
  return deps
    .filter(d => d.settled_at === null && depKind(d) === 'hold')
    .reduce((s, d) => s + Number(d.amount), 0)
}

/** 통과형 미회수 누계 (매출에서 이미 차감됐으나 매입에서 아직 회수 못 한 금액) */
export function sumUnrecovered(
  deps: Array<Pick<MonthlyDepreciation, 'amount' | 'settled_at' | 'sales_deduct_ym'>>,
): number {
  return deps
    .filter(d => d.settled_at === null && depKind(d) === 'passthrough')
    .reduce((s, d) => s + Number(d.amount), 0)
}

// ── 실입금 차액 → 공급가/부가세 역산 ───────────────────────

export type ShortfallSplit =
  | { ok: true; diff: number; supply: number; vat: number }
  | { ok: false; error: string }

/**
 * 계산서 총액과 실입금액의 차액을 공급가액+부가세로 역산.
 * 담당자가 감가 공급가를 직접 계산하지 않게 하되, 역산 결과가 부가세 규칙과
 * 맞아떨어지는지 반드시 검증한다 (안 맞으면 감가 외 원인 — 임의 저장 금지).
 */
export function splitShortfall(diff: number, hasVat: boolean): ShortfallSplit {
  if (!Number.isInteger(diff) || diff <= 0) {
    return { ok: false, error: '차액은 0보다 큰 정수여야 합니다.' }
  }
  if (!hasVat) return { ok: true, diff, supply: diff, vat: 0 }

  const supply = Math.round(diff / 1.1)
  const vat    = diff - supply
  if (Math.round(supply * 0.1) !== vat) {
    return {
      ok: false,
      error: `차액 ${diff.toLocaleString('ko-KR')}원이 공급가액+부가세(10%)로 떨어지지 않습니다. 감가 외 원인일 수 있으니 확인하세요.`,
    }
  }
  return { ok: true, diff, supply, vat }
}

/** 실입금액 입력 검증 — 계산서 총액 대비 */
export function parsePaidAmount(
  raw: string | number,
  totalAmount: number,
): { ok: true; amount: number; diff: number } | { ok: false; error: string } {
  const amount = typeof raw === 'number'
    ? raw
    : Number(String(raw).replace(/,/g, '').trim() || NaN)
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    return { ok: false, error: '실입금액은 0 이상의 원 단위 정수여야 합니다.' }
  }
  if (amount > totalAmount) {
    return {
      ok: false,
      error: `실입금액이 계산서 총액(${totalAmount.toLocaleString('ko-KR')}원)보다 큽니다. 과입금이면 별도로 확인하세요.`,
    }
  }
  return { ok: true, amount, diff: totalAmount - amount }
}

// ── 계산서 행 배지 판정 ────────────────────────────────────

export type DepBadge = {
  tone: 'shortfall' | 'applied' | 'pending' | 'hold'
  text: string
}

type BadgeInvoice = {
  invoice_type: string | null
  product_id: string | null
  delivery_year_month: string | null
  from_company: string
  to_company: string
}

/** 감가가 반영된 계산서 행의 산식 — 화면에 "원금액 − 감가 = 청구액"을 그대로 보여주기 위한 값 */
export type DepBreakdown = {
  grossSupply: number; grossVat: number; grossTotal: number
  depSupply: number;   depVat: number;   depTotal: number
  netSupply: number;   netVat: number;   netTotal: number
  originYMs: string[]
}

type AmountInvoice = BadgeInvoice & {
  supply_amount: number | string
  vat_amount: number | string
  total_amount: number | string
}

/**
 * 매출·매입 계산서 행의 감가 산식 역산.
 * 저장된 금액은 이미 차감된 값이므로, 감가를 더해 차감 전 금액을 복원한다.
 * 커미션 행은 금액이 마진 배분이라 산식이 성립하지 않으므로 대상 아님(memo·배지로 안내).
 */
export function depBreakdownFor(
  inv: AmountInvoice,
  deps: MonthlyDepreciation[],
): DepBreakdown | null {
  if (!inv.product_id || !inv.delivery_year_month) return null
  const dym = inv.delivery_year_month

  const hit = deps.filter(d =>
    d.product_id === inv.product_id &&
    (inv.invoice_type === 'sales'
      ? d.sales_deduct_ym === dym
      : inv.invoice_type === 'cost' && (d.cost_deduct_ym ?? d.year_month) === dym),
  )
  if (hit.length === 0) return null

  const netSupply = Number(inv.supply_amount)
  const netVat    = Number(inv.vat_amount)
  const depSupply = hit.reduce((s, d) => s + Number(d.amount), 0)
  // VAT 관례는 상대 거래처 기준 — 계산서 생성 시 vatOverride와 같은 규칙이어야 산식이 맞는다
  const counterparty = inv.from_company === '(주)한국에이원' ? inv.to_company : inv.from_company
  const depVat = netVat > 0
    ? (counterparty === '동창' ? Math.floor(depSupply * 0.1) : Math.round(depSupply * 0.1))
    : 0

  return {
    grossSupply: netSupply + depSupply,
    grossVat:    netVat + depVat,
    grossTotal:  netSupply + depSupply + netVat + depVat,
    depSupply, depVat, depTotal: depSupply + depVat,
    netSupply, netVat, netTotal: Number(inv.total_amount),
    originYMs: Array.from(new Set(hit.map(d => d.year_month))).sort(),
  }
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}
function ymLabel(ym: string): string {
  return `${parseInt(ym.slice(5, 7))}월`
}
function originLabels(deps: MonthlyDepreciation[]): string {
  return Array.from(new Set(deps.map(d => ymLabel(d.year_month)))).join('·')
}

/**
 * 계산서 한 행에 표시할 감가 배지.
 *
 * 담당자 실수 방지가 목적이므로 "이번 달은 차감 없음"(pending)을 반드시 표시한다.
 * 조용히 두면 담당자가 스스로 판단해 이중 차감한다.
 */
export function depBadgeFor(
  inv: BadgeInvoice,
  deps: MonthlyDepreciation[],
): DepBadge | null {
  if (!inv.product_id || !inv.delivery_year_month) return null
  const mine = deps.filter(d => d.product_id === inv.product_id)
  if (mine.length === 0) return null

  const dym = inv.delivery_year_month

  // 매출: 현대가 감가를 반영해 역발행한 달 — 계산서·입금이 이미 감액된 금액임을 명시
  if (inv.invoice_type === 'sales') {
    const hit = mine.filter(d => d.sales_deduct_ym === dym)
    if (hit.length === 0) return null
    const amt = hit.reduce((s, d) => s + Number(d.amount), 0)
    const to  = hit.find(d => d.cost_deduct_ym)?.cost_deduct_ym
    return {
      tone: 'shortfall',
      text: `감가 −${fmt(amt)}원(공급가) 반영 발행 — 실제 역발행·입금액과 일치, 커미션도 감액${to ? `. ${ymLabel(to)}분 매입에서 회수` : ''}`,
    }
  }

  // 커미션: 금액만 달라지고 이유가 없으면 계산 오류로 오인한다
  if (inv.invoice_type === 'commission') {
    const borne = mine.filter(d => d.sales_deduct_ym === dym)
    if (borne.length > 0) {
      const amt = borne.reduce((s, d) => s + Number(d.amount), 0)
      return {
        tone: 'shortfall',
        text: `${originLabels(borne)}분 감가 ${fmt(amt)}원을 뺀 마진 기준 — 3사가 나눠 부담(회수월에 되돌아옴)`,
      }
    }
    const back = mine.filter(d => (d.cost_deduct_ym ?? d.year_month) === dym && depKind(d) === 'passthrough')
    if (back.length > 0) {
      const amt = back.reduce((s, d) => s + Number(d.amount), 0)
      return {
        tone: 'applied',
        text: `${originLabels(back)}분 감가 ${fmt(amt)}원 회수분을 더한 마진 기준 — 3사 분담분 복구`,
      }
    }
    return null
  }

  if (inv.invoice_type !== 'cost') return null

  // 매입: 이번 달이 차감 대상인가
  const applied = mine.filter(d => d.cost_deduct_ym === dym)
  if (applied.length > 0) {
    const amt = applied.reduce((s, d) => s + Number(d.amount), 0)
    const kind = depKind(applied[0])
    const origins = Array.from(new Set(applied.map(d => ymLabel(d.year_month)))).join('·')
    return {
      tone: kind === 'passthrough' ? 'applied' : 'hold',
      text: kind === 'passthrough'
        ? `${origins}분 감가 −${fmt(amt)}원 반영 발행 — 그대로 지급하면 회수 완료`
        : `${origins}분 감가 −${fmt(amt)}원 차감 발행 (보관 — 반환 예정)`,
    }
  }

  // 차감 대상이 아닌 달 — "아무것도 하지 말 것"을 명시 (이중 차감 방지)
  const waiting = mine.filter(
    d => d.settled_at === null && depKind(d) === 'passthrough' &&
         d.cost_deduct_ym !== null && d.cost_deduct_ym > dym,
  )
  if (waiting.length === 0) return null
  const amt  = waiting.reduce((s, d) => s + Number(d.amount), 0)
  const when = waiting.map(d => d.cost_deduct_ym!).sort()[0]
  const from = Array.from(new Set(waiting.map(d => ymLabel(d.year_month)))).join('·')
  return {
    tone: 'pending',
    text: `감가 차감 없음 — 계산서대로 전액 지급. ${from}분 감가 ${fmt(amt)}원은 ${ymLabel(when)}분에서 회수 예정`,
  }
}
