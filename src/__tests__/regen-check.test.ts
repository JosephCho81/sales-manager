import { describe, it, expect } from 'vitest'
import { needsInvoiceRegen } from '@/lib/invoice-generator/regen-check'
import type { InvoiceRow } from '@/lib/invoice-generator/types'

type Inv = Pick<InvoiceRow, 'invoice_type' | 'delivery_year_month' | 'product_id' | 'delivery_ids' | 'memo'>

function commInv(overrides: Partial<Inv> = {}): Inv {
  return {
    invoice_type: 'commission',
    delivery_year_month: '2026-05',
    product_id: null,
    delivery_ids: ['comm-dongkuk'],
    memo: '2026년 05월 동국제강 커미션 수취',
    ...overrides,
  }
}

const salesInv: Inv = {
  invoice_type: 'sales',
  delivery_year_month: null,
  product_id: 'prod-1',
  delivery_ids: ['d1'],
  memo: null,
}

describe('needsInvoiceRegen', () => {
  it('계산서가 하나도 없으면 true', () => {
    expect(needsInvoiceRegen([], ['comm-1'], '2026-07')).toBe(true)
  })

  it('동국제강(M-2)·현대제철(M-1) 월이 맞고 커미션 계산서가 모두 있으면 false', () => {
    const invoices = [
      salesInv,
      commInv(),
      commInv({ delivery_ids: ['comm-hyundai'], delivery_year_month: '2026-06', memo: '2026년 06월 현대제철 커미션 수취' }),
    ]
    expect(needsInvoiceRegen(invoices, ['comm-dongkuk', 'comm-hyundai'], '2026-07')).toBe(false)
  })

  it('커미션 계산서 월이 stale이면 true (동국제강 M-2 불일치)', () => {
    const invoices = [commInv({ delivery_year_month: '2026-04' })]
    expect(needsInvoiceRegen(invoices, ['comm-dongkuk'], '2026-07')).toBe(true)
  })

  it('현대제철은 M-1 기준으로 stale 판정', () => {
    const ok = [commInv({ delivery_ids: ['comm-hyundai'], delivery_year_month: '2026-06', memo: '현대제철 커미션 수취' })]
    expect(needsInvoiceRegen(ok, ['comm-hyundai'], '2026-07')).toBe(false)
    const stale = [commInv({ delivery_ids: ['comm-hyundai'], delivery_year_month: '2026-05', memo: '현대제철 커미션 수취' })]
    expect(needsInvoiceRegen(stale, ['comm-hyundai'], '2026-07')).toBe(true)
  })

  // 회귀: 2026-07-03 — 현대제철 커미션 등록 직후 stale props 재생성으로
  // 현대제철 그룹만 통째로 유실됐는데, 동국제강 계산서가 있어 재생성이 트리거되지 않았음
  it('등록된 커미션의 계산서가 누락되면 true (다른 회사 커미션 계산서가 있어도)', () => {
    const invoices = [salesInv, commInv()] // 동국제강만 존재
    expect(needsInvoiceRegen(invoices, ['comm-dongkuk', 'comm-hyundai'], '2026-07')).toBe(true)
  })

  it('납품 기반 커미션(product_id != null)은 stale·누락 판정에 관여하지 않음', () => {
    const invoices = [
      commInv(),
      // 소괴탄/분탄류: product_id 있음, delivery_ids는 납품 ID
      commInv({ product_id: 'prod-soggae', delivery_ids: ['d9'], delivery_year_month: '2026-01', memo: '금화 커미션 1/3' }),
    ]
    expect(needsInvoiceRegen(invoices, ['comm-dongkuk'], '2026-07')).toBe(false)
  })

  it('등록된 커미션이 없으면 누락 판정 없이 false', () => {
    expect(needsInvoiceRegen([salesInv], [], '2026-07')).toBe(false)
  })
})

import { diffInvoices } from '@/lib/invoice-generator/regen-check'

describe('diffInvoices — 입고·감가 변경 감지', () => {
  const row = (o: Record<string, unknown> = {}) => ({
    invoice_type: 'sales', product_id: 'p1', from_company: '한국에이원', to_company: '동국제강',
    delivery_year_month: '2026-10', delivery_ids: ['d1', 'd2'],
    supply_amount: 1000, vat_amount: 100, total_amount: 1100,
    invoice_basis_date: '2026-10-31', issue_deadline: '2026-11-10', payment_due_date: '2026-11-30',
    ...o,
  }) as Parameters<typeof diffInvoices>[0][number]
  const label = () => 'L'

  it('같으면 빈 배열 — DB의 numeric 문자열·delivery_ids 순서는 무시', () => {
    const stored = row({ supply_amount: '1000', vat_amount: '100', total_amount: '1100', delivery_ids: ['d2', 'd1'] })
    expect(diffInvoices([row()], [stored as never], label)).toEqual([])
  })

  it('물량 수정으로 금액이 바뀌면 감지', () => {
    const d = diffInvoices([row({ total_amount: 2200 })], [row() as never], label)
    expect(d).toEqual([{ label: 'L', product_id: 'p1', before: 1100, after: 2200 }])
  })

  it('입고 추가로 계산서가 새로 생기거나, 삭제로 사라지면 감지', () => {
    expect(diffInvoices([row(), row({ invoice_type: 'cost' })], [row() as never], label)).toHaveLength(1)
    expect(diffInvoices([], [row() as never], label)).toEqual([{ label: 'L', product_id: 'p1', before: 1100, after: null }])
  })

  it('AL30처럼 같은 거래 단위 여러 장은 순서와 무관하게 묶어서 비교', () => {
    const a = row({ invoice_basis_date: '2026-10-10', total_amount: 1 })
    const b = row({ invoice_basis_date: '2026-10-20', total_amount: 2 })
    expect(diffInvoices([a, b], [b as never, a as never], label)).toEqual([])
  })
})
