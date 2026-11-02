/**
 * 지급일정 재생성 필요 여부 판단 (순수 함수)
 *
 * 조건:
 *   1. 계산서가 하나도 없음
 *   2. 커미션 계산서의 delivery_year_month가 기대 월과 다름 (stale)
 *      — 동국제강 = M-2, 현대제철 = M-1
 *   3. 등록된 커미션인데 대응 계산서가 없음
 *      — 커미션 등록 후 stale props로 재생성되어 특정 회사 그룹이 통째로
 *        유실된 경우 자가 감지 (2026-07-03 현대제철 커미션 유실 사고)
 */
import { shiftMonths } from '@/lib/date'
import type { InvoiceRow, InvoiceToCreate } from './types'

type InvoiceForRegenCheck = Pick<
  InvoiceRow,
  'invoice_type' | 'delivery_year_month' | 'product_id' | 'delivery_ids' | 'memo'
>

export function needsInvoiceRegen(
  invoices: InvoiceForRegenCheck[],
  commissionIds: string[],
  yearMonth: string,
): boolean {
  if (invoices.length === 0) return true

  const hasStaleComm = invoices.some(inv => {
    // product_id != null = 소괴탄/분탄 등 납품 기반 커미션 → stale 체크 대상 아님
    if (inv.invoice_type !== 'commission' || inv.delivery_year_month === null || inv.product_id !== null) return false
    const expected = (inv.memo ?? '').includes('현대제철')
      ? shiftMonths(yearMonth, -1)
      : shiftMonths(yearMonth, -2)
    return inv.delivery_year_month !== expected
  })
  if (hasStaleComm) return true

  // 커미션 계산서는 delivery_ids[0]에 커미션 레코드 ID를 담음 (commission.ts)
  return commissionIds.some(cid =>
    !invoices.some(inv =>
      inv.invoice_type === 'commission' &&
      inv.product_id === null &&
      (inv.delivery_ids ?? []).includes(cid)
    )
  )
}

// ── 입력 변경 감지 ──────────────────────────────────────────
// 위 needsInvoiceRegen은 "계산서가 없음 / 커미션 누락"만 본다. 입고 물량·단가·감가가
// 바뀌어도 저장된 계산서는 그대로라 담당자가 매번 재생성을 눌러야 했다.
// 페이지가 이미 fresh 조회한 입력으로 계산서를 메모리에서 다시 만들어 저장본과 비교한다.

type GeneratedForDiff = Pick<
  InvoiceToCreate,
  'invoice_type' | 'product_id' | 'from_company' | 'to_company' | 'delivery_year_month' | 'delivery_ids'
  | 'supply_amount' | 'vat_amount' | 'total_amount' | 'invoice_basis_date' | 'issue_deadline' | 'payment_due_date'
>
type StoredForDiff = Pick<
  InvoiceRow,
  'invoice_type' | 'product_id' | 'from_company' | 'to_company' | 'delivery_year_month' | 'delivery_ids'
  | 'supply_amount' | 'vat_amount' | 'total_amount' | 'invoice_basis_date' | 'issue_deadline' | 'payment_due_date'
>

export type InvoiceDrift = {
  /** 거래 단위(품목·발행→수취·유형) 설명 */
  label: string
  /** 품목 (커미션 계산서 = null) — 어떤 입력 변경 때문인지 맞춰 보는 데 쓴다 */
  product_id: string | null
  /** 저장된 계산서 총액 합 (없으면 null = 새로 생길 계산서) */
  before: number | null
  /** 지금 입력으로 만든 계산서 총액 합 (없으면 null = 사라질 계산서) */
  after: number | null
}

// memo는 비교하지 않는다 — 금액·날짜·대상 입고가 같으면 같은 계산서다
function groupKey(r: GeneratedForDiff | StoredForDiff): string {
  return `${r.invoice_type}|${r.product_id ?? ''}|${r.from_company}|${r.to_company}`
}

function signature(r: GeneratedForDiff | StoredForDiff): string {
  return [
    r.delivery_year_month ?? '',
    Number(r.supply_amount), Number(r.vat_amount), Number(r.total_amount),
    r.invoice_basis_date ?? '', r.issue_deadline ?? '', r.payment_due_date ?? '',
    [...(r.delivery_ids ?? [])].sort().join(','),
  ].join('|')
}

/**
 * 저장된 계산서와 현재 입력으로 만든 계산서의 차이. 빈 배열 = 재생성 불필요.
 * 같은 거래 단위에 여러 장(AL30 10일 구간 3장)이 있을 수 있어 묶음 단위로 비교한다.
 */
export function diffInvoices(
  generated: GeneratedForDiff[],
  stored: StoredForDiff[],
  labelOf: (r: GeneratedForDiff | StoredForDiff) => string,
): InvoiceDrift[] {
  const groups = new Map<string, { gen: GeneratedForDiff[]; sto: StoredForDiff[] }>()
  const bucket = (k: string) => {
    let g = groups.get(k)
    if (!g) { g = { gen: [], sto: [] }; groups.set(k, g) }
    return g
  }
  for (const r of generated) bucket(groupKey(r)).gen.push(r)
  for (const r of stored) bucket(groupKey(r)).sto.push(r)

  const drifts: InvoiceDrift[] = []
  for (const { gen, sto } of groups.values()) {
    const a = gen.map(signature).sort().join('\n')
    const b = sto.map(signature).sort().join('\n')
    if (a === b) continue
    const sum = (rs: Array<GeneratedForDiff | StoredForDiff>) =>
      rs.length === 0 ? null : rs.reduce((s, r) => s + Number(r.total_amount), 0)
    const head = gen[0] ?? sto[0]
    drifts.push({ label: labelOf(head), product_id: head.product_id, before: sum(sto), after: sum(gen) })
  }
  return drifts
}
