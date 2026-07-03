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
