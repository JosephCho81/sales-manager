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
import type { InvoiceRow } from './types'

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
