/**
 * 동국제강 / 현대제철 커미션 계산서 생성
 *
 * 구조 (회사당 3장):
 *   1. company → 한국에이원  : 수취 (전액)
 *   2. 한국에이원 → 금화     : 1/3 배분
 *   3. 한국에이원 → 라성     : 1/3 배분 (한국에이원 1/3 보유 — 계산서 없음)
 *
 * 날짜: 당월말 기준, 익월 15일 지급
 */
import { splitMargin } from '@/lib/margin'
import { monthEnd, nthDay, shiftMonths } from '@/lib/date'
import type { InvoiceToCreate } from './types'

export type CommissionForInvoice = {
  id: string
  year_month: string
  company: '동국제강' | '현대제철'
  commission_amount: number
  memo: string | null
}

export function generateCommissionInvoices(
  commissions: CommissionForInvoice[],
  yearMonth: string,
): InvoiceToCreate[] {
  const result: InvoiceToCreate[] = []

  for (const c of commissions) {
    const { geumhwa, raseong } = splitMargin(c.commission_amount)
    const nextM = shiftMonths(c.year_month, 1)
    // 회사명을 항상 포함 — commGroupLabel이 memo에서 회사명을 감지하므로
    const label = `${c.year_month.replace('-', '년 ')}월 ${c.company} 커미션${c.memo ? ' — ' + c.memo : ''}`
    const basis = monthEnd(c.year_month)
    const due   = nthDay(nextM, 15)

    const deliveryYM = c.year_month

    // 1. 수취: 화림 → 한국에이원
    result.push({
      year_month:          yearMonth,
      delivery_year_month: deliveryYM,
      product_id:          null,
      delivery_ids:        [c.id],
      from_company:        '화림',
      to_company:          '한국에이원',
      supply_amount:       Math.round(c.commission_amount),
      vat_amount:          0,
      total_amount:        Math.round(c.commission_amount),
      invoice_basis_date:  basis,
      issue_deadline:      due,
      payment_due_date:    due,
      is_paid:             false,
      invoice_type:        'commission',
      memo:                `${label} 수취`,
    })

    // 2. 금화 1/3
    if (geumhwa > 0) {
      result.push({
        year_month:          yearMonth,
        delivery_year_month: deliveryYM,
        product_id:          null,
        delivery_ids:        [c.id],
        from_company:        '한국에이원',
        to_company:          '금화',
        supply_amount:       geumhwa,
        vat_amount:          0,
        total_amount:        geumhwa,
        invoice_basis_date:  basis,
        issue_deadline:      due,
        payment_due_date:    due,
        is_paid:             false,
        invoice_type:        'commission',
        memo:                `${label} — 금화 1/3`,
      })
    }

    // 3. 라성 1/3
    if (raseong > 0) {
      result.push({
        year_month:          yearMonth,
        delivery_year_month: deliveryYM,
        product_id:          null,
        delivery_ids:        [c.id],
        from_company:        '한국에이원',
        to_company:          '라성',
        supply_amount:       raseong,
        vat_amount:          0,
        total_amount:        raseong,
        invoice_basis_date:  basis,
        issue_deadline:      due,
        payment_due_date:    due,
        is_paid:             false,
        invoice_type:        'commission',
        memo:                `${label} — 라성 1/3`,
      })
    }
  }

  return result
}
