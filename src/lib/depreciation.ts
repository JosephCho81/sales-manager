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
  /** 감가 반영 매입 계산서의 실제 부가세. 빈 값 = 계산값 사용 */
  cost_vat_actual?: string | number | null
}

export type ParsedMonthlyDep =
  | {
      ok: true
      year_month: string
      amount: number
      memo: string | null
      sales_deduct_ym: string | null
      cost_deduct_ym: string
      cost_vat_actual: number | null
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

  // 실물 계산서 부가세 — 거래처 반올림 관례가 달마다 달라 공식으로 못 맞추는 경우의 탈출구.
  // 빈 값은 "계산값 사용"이고, 0은 유효한 입력(면세)이므로 빈 문자열과 0을 구분해야 한다
  const vatRaw = typeof raw.cost_vat_actual === 'string'
    ? raw.cost_vat_actual.replace(/,/g, '').trim()
    : raw.cost_vat_actual
  let costVat: number | null = null
  if (vatRaw !== null && vatRaw !== undefined && vatRaw !== '') {
    costVat = Number(vatRaw)
    if (!Number.isFinite(costVat) || !Number.isInteger(costVat) || costVat < 0) {
      return { ok: false, error: '실제 부가세는 0 이상의 원 단위 정수여야 합니다.' }
    }
  }

  return {
    ok: true,
    year_month: raw.year_month,
    amount,
    memo: raw.memo?.trim() || null,
    sales_deduct_ym: sales,
    cost_deduct_ym: cost,
    cost_vat_actual: costVat,
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
  /** 계산서 표에 그대로 놓는 한 줄 — 길면 행이 밀려 어느 줄에 뭐가 있는지 안 보인다 */
  short: string
  /** 전체 설명. 표에서는 title(툴팁), 감가 패널에서는 본문으로 쓴다 */
  text: string
}

type BadgeInvoice = {
  invoice_type: string | null
  product_id: string | null
  delivery_year_month: string | null
  from_company: string
  to_company: string
  id?: string
  invoice_basis_date?: string | null
}

/**
 * 매출 계산서가 같은 품목·납품월에 여러 장(AL30 10일 단위 3구간)일 때,
 * 감가는 **마지막 발행 구간 1장**에만 반영된다(`al30.ts`의 lastSale). 나머지 두 장에도
 * 감가 배지·산식을 붙이면 실제로 차감되지 않은 계산서를 차감된 것처럼 보여주게 된다.
 * 반환값을 `depBadgeFor`/`depBreakdownFor`에 넘기면 대상이 아닌 매출 행은 걸러진다.
 */
export function salesDepTargetIds(invoices: BadgeInvoice[]): Set<string> {
  const last = new Map<string, { id: string; basis: string }>()
  for (const inv of invoices) {
    if (inv.invoice_type !== 'sales' || !inv.id || !inv.product_id || !inv.delivery_year_month) continue
    const key   = `${inv.product_id}_${inv.delivery_year_month}`
    const basis = inv.invoice_basis_date ?? ''
    const cur   = last.get(key)
    if (!cur || basis >= cur.basis) last.set(key, { id: inv.id, basis })
  }
  return new Set(Array.from(last.values()).map(v => v.id))
}

/** 매출 행이면서 감가 반영 대상이 아닌 경우 true — 배지·산식을 숨겨야 한다 */
function isSkippedSalesLine(inv: BadgeInvoice, salesTargetIds?: Set<string>): boolean {
  return salesTargetIds !== undefined
      && inv.invoice_type === 'sales'
      && (!inv.id || !salesTargetIds.has(inv.id))
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
  /** 매출 계산서가 여러 장인 품목에서 실제 차감된 1장을 가리는 집합 (salesDepTargetIds) */
  salesTargetIds?: Set<string>,
): DepBreakdown | null {
  if (!inv.product_id || !inv.delivery_year_month) return null
  if (isSkippedSalesLine(inv, salesTargetIds)) return null
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
  // VAT 관례는 상대 거래처 기준 — 계산서 생성 시 vatOverride와 같은 규칙이어야 산식이 맞는다.
  // 감가분 VAT는 감가 전 총액 VAT에서 실제 청구 VAT를 뺀 값으로 역산한다. 감가분에 직접
  // 10%를 매기면 cost_vat_actual(실물 계산서 값)이 들어온 달에 산식이 1원 어긋난다
  const counterparty = inv.from_company === '(주)한국에이원' ? inv.to_company : inv.from_company
  const grossVat = counterparty === '동창'
    ? Math.floor((netSupply + depSupply) * 0.1)
    : Math.round((netSupply + depSupply) * 0.1)
  const depVat = netVat > 0 ? grossVat - netVat : 0

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
  /** 매출 계산서가 여러 장인 품목에서 실제 차감된 1장을 가리는 집합 (salesDepTargetIds) */
  salesTargetIds?: Set<string>,
): DepBadge | null {
  if (!inv.product_id || !inv.delivery_year_month) return null
  if (isSkippedSalesLine(inv, salesTargetIds)) return null
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
      short: `감가 −${fmt(amt)}원 반영 발행`,
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
        short: `감가 −${fmt(amt)}원 분담`,
        text: `${originLabels(borne)}분 감가 ${fmt(amt)}원을 뺀 마진 기준 — 3사가 나눠 부담(회수월에 되돌아옴)`,
      }
    }
    const back = mine.filter(d => (d.cost_deduct_ym ?? d.year_month) === dym && depKind(d) === 'passthrough')
    if (back.length > 0) {
      const amt = back.reduce((s, d) => s + Number(d.amount), 0)
      return {
        tone: 'applied',
        short: `감가 +${fmt(amt)}원 회수`,
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
      short: kind === 'passthrough'
        ? `감가 −${fmt(amt)}원 회수`
        : `감가 −${fmt(amt)}원 (보관)`,
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
    short: '감가 차감 없음',
    text: `감가 차감 없음 — 계산서대로 전액 지급. ${from}분 감가 ${fmt(amt)}원은 ${ymLabel(when)}분에서 회수 예정`,
  }
}

// ── 감가 → 계산서 반영 위치 ────────────────────────────────

export type DepImpact = {
  invoiceId: string
  role: 'sales' | 'cost'
  from: string
  to: string
  badge: DepBadge | null
  breakdown: DepBreakdown | null
}

type ImpactInvoice = AmountInvoice & { id: string }

/**
 * 감가 한 건이 이번 조회월 계산서 중 어디에 반영됐는지 — 감가 패널에서
 * "어느 계산서가 얼마로 바뀌었는지"를 숫자로 보여주기 위한 것.
 *
 * 표에 있는 계산서만 대상이므로, 반영 월이 다른 감가는 빈 배열이 나온다(= 이 달엔 영향 없음).
 */
export function depImpactsFor(
  dep: MonthlyDepreciation,
  invoices: ImpactInvoice[],
  allDeps: MonthlyDepreciation[],
): DepImpact[] {
  const targets = salesDepTargetIds(invoices)
  const costYM  = dep.cost_deduct_ym ?? dep.year_month
  const out: DepImpact[] = []

  for (const inv of invoices) {
    if (inv.product_id !== dep.product_id || !inv.delivery_year_month) continue
    const role: 'sales' | 'cost' | null =
      inv.invoice_type === 'cost'  && inv.delivery_year_month === costYM            ? 'cost'
    : inv.invoice_type === 'sales' && inv.delivery_year_month === dep.sales_deduct_ym ? 'sales'
    : null
    if (role === null) continue
    if (role === 'sales' && !targets.has(inv.id)) continue

    out.push({
      invoiceId: inv.id,
      role,
      from: inv.from_company,
      to: inv.to_company,
      badge: depBadgeFor(inv, allDeps, targets),
      breakdown: depBreakdownFor(inv, allDeps, targets),
    })
  }
  // 매출(감액 발행) → 매입(차감·회수) 순으로 읽히게
  return out.sort((a, b) => (a.role === 'sales' ? 0 : 1) - (b.role === 'sales' ? 0 : 1))
}
