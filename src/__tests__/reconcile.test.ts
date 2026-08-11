import { describe, it, expect } from 'vitest'
import { diffInvoice, summarizeReconciliation, parseAmountInput } from '@/lib/reconcile'
import type { InvoiceRow } from '@/lib/invoice-generator'

function inv(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 'i1',
    year_month: '2026-08',
    delivery_year_month: '2026-07',
    product_id: 'p1',
    delivery_ids: ['d1'],
    from_company: '(주)한국에이원',
    to_company: '동창',
    supply_amount: 392_511_290,
    vat_amount: 39_233_044,
    total_amount: 431_744_334,
    invoice_basis_date: '2026-07-31',
    issue_deadline: '2026-08-03',
    payment_due_date: '2026-08-10',
    is_paid: false,
    paid_at: null,
    paid_amount: null,
    actual_supply_amount: null,
    actual_vat_amount: null,
    reconciled_at: null,
    reconcile_memo: null,
    memo: null,
    invoice_type: 'cost',
    ...overrides,
  }
}

const reconciled = (supply: number, vat: number) =>
  inv({ actual_supply_amount: supply, actual_vat_amount: vat, reconciled_at: '2026-08-11T00:00:00Z' })

describe('diffInvoice', () => {
  it('미대사면 null', () => {
    expect(diffInvoice(inv())).toBeNull()
  })

  it('금액만 있고 reconciled_at이 없으면 미대사 취급', () => {
    expect(diffInvoice(inv({ actual_supply_amount: 1, actual_vat_amount: 1 }))).toBeNull()
  })

  it('완전 일치', () => {
    const d = diffInvoice(reconciled(392_511_290, 39_233_044))!
    expect(d).toEqual({ supply: 0, vat: 0, total: 0, matched: true })
  })

  it('부가세 1원 차이 — 절사 관례가 다른 실제 사례', () => {
    // 라인별 절사 39,233,044 vs 일괄 절사가 실물인 달
    const d = diffInvoice(reconciled(392_511_290, 39_233_043))!
    expect(d.supply).toBe(0)
    expect(d.vat).toBe(-1)
    expect(d.total).toBe(-1)
    expect(d.matched).toBe(false)
  })

  it('실물이 더 큰 경우는 양수', () => {
    expect(diffInvoice(reconciled(392_511_300, 39_233_044))!.supply).toBe(10)
  })
})

describe('summarizeReconciliation', () => {
  it('미대사·일치·차이를 나눠 센다', () => {
    const rows = [
      inv({ id: 'a' }),
      reconciled(392_511_290, 39_233_044),
      { ...reconciled(392_511_290, 39_233_043), id: 'c' },
      { ...reconciled(392_511_290, 39_233_046), id: 'd' },
    ]
    const r = summarizeReconciliation(rows)
    expect(r).toEqual({ total: 4, reconciled: 3, matched: 1, mismatched: 2, diffTotal: 1 })
  })

  it('빈 목록', () => {
    expect(summarizeReconciliation([])).toEqual({
      total: 0, reconciled: 0, matched: 0, mismatched: 0, diffTotal: 0,
    })
  })
})

describe('parseAmountInput — 실물 전사 오류 차단', () => {
  it('쉼표·공백 허용', () => {
    expect(parseAmountInput(' 392,511,290 ')).toEqual({ ok: true, value: 392_511_290 })
  })

  it('0 허용 (부가세 없는 계산서)', () => {
    expect(parseAmountInput('0')).toEqual({ ok: true, value: 0 })
  })

  it.each(['', '  ', null, undefined])('빈 값 거부: %s', v => {
    expect(parseAmountInput(v as string).ok).toBe(false)
  })

  it.each(['-100', '1234.5', '1e6', '삼십만', '12,34a'])('정수 아닌 값 거부: %s', v => {
    expect(parseAmountInput(v).ok).toBe(false)
  })

  it('안전 정수 범위를 넘으면 거부', () => {
    expect(parseAmountInput('9'.repeat(20)).ok).toBe(false)
  })
})
