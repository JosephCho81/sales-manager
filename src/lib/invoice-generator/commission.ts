/**
 * 동국제강 / 현대제철 커미션 계산서 생성
 *
 * 구조 (회사당 3장):
 *   1. company → 한국에이원  : 수취 (전액)
 *   2. 한국에이원 → 금화     : 1/3 배분
 *   3. 한국에이원 → 라성     : 1/3 배분 (한국에이원 1/3 보유 — 계산서 없음)
 *
 * 날짜 (화림→한국에이원 수취): 동국제강=(m-1)월 3일/6일, 현대제철=m월 3일/6일 (워킹데이 기준)
 * 날짜 (금화·나성 배분): 조회월(m) 10일 기준
 */
import { splitMargin } from '@/lib/margin'
import { workingDayOnOrAfter, shiftMonths } from '@/lib/date'
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
    // 회사명을 항상 포함 — commGroupLabel이 memo에서 회사명을 감지하므로
    const label = `${c.year_month.replace('-', '년 ')}월 ${c.company} 커미션${c.memo ? ' — ' + c.memo : ''}`

    // 화림→한국에이원 수취 invoice: 동국제강=전월(m-1) 3일/6일, 현대제철=조회월(m) 3일/6일
    const basisYM   = c.company === '동국제강' ? shiftMonths(yearMonth, -1) : yearMonth
    const basisMain = workingDayOnOrAfter(basisYM, 3)
    const dueMain   = workingDayOnOrAfter(basisYM, 6)

    // 금화·나성 배분 invoice: 기존 조회월(m) 10일 유지
    const workingDay10 = workingDayOnOrAfter(yearMonth, 10)

    const deliveryYM = c.year_month

    const supplyMain = Math.round(c.commission_amount)
    const vatMain    = Math.floor(supplyMain * 0.1)

    // 1. 수취: 화림 → 한국에이원
    result.push({
      year_month:          yearMonth,
      delivery_year_month: deliveryYM,
      product_id:          null,
      delivery_ids:        [c.id],
      from_company:        '화림',
      to_company:          '(주)한국에이원',
      supply_amount:       supplyMain,
      vat_amount:          vatMain,
      total_amount:        supplyMain + vatMain,
      invoice_basis_date:  basisMain,
      issue_deadline:      dueMain,
      payment_due_date:    dueMain,
      is_paid:             false,
      invoice_type:        'commission',
      memo:                `${label} 수취`,
    })

    // 2. 금화 1/3
    if (geumhwa > 0) {
      const vatG = Math.floor(geumhwa * 0.1)
      result.push({
        year_month:          yearMonth,
        delivery_year_month: deliveryYM,
        product_id:          null,
        delivery_ids:        [c.id],
        from_company:        '(주)한국에이원',
        to_company:          '금화',
        supply_amount:       geumhwa,
        vat_amount:          vatG,
        total_amount:        geumhwa + vatG,
        invoice_basis_date:  workingDay10,
        issue_deadline:      workingDay10,
        payment_due_date:    workingDay10,
        is_paid:             false,
        invoice_type:        'commission',
        memo:                `${label} — 금화 1/3`,
      })
    }

    // 3. (주)나성 1/3
    if (raseong > 0) {
      const vatR = Math.floor(raseong * 0.1)
      result.push({
        year_month:          yearMonth,
        delivery_year_month: deliveryYM,
        product_id:          null,
        delivery_ids:        [c.id],
        from_company:        '(주)한국에이원',
        to_company:          '(주)나성',
        supply_amount:       raseong,
        vat_amount:          vatR,
        total_amount:        raseong + vatR,
        invoice_basis_date:  workingDay10,
        issue_deadline:      workingDay10,
        payment_due_date:    workingDay10,
        is_paid:             false,
        invoice_type:        'commission',
        memo:                `${label} — (주)나성 1/3`,
      })
    }
  }

  return result
}
