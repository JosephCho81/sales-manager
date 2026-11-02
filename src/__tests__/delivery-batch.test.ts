import { describe, it, expect } from 'vitest'
import {
  buildDeliveryRows, parseTonsToKg, duplicateLines, invoiceMonthConflict,
  type ContractForDelivery,
} from '@/lib/delivery-batch'

const AL35B_A: ContractForDelivery = { id: 'c-a', product_id: 'p-al35b', start_date: '2026-07-01', end_date: '2026-12-31', invoice_month_offset: 1 }
const AL35B_B: ContractForDelivery = { id: 'c-b', product_id: 'p-al35b', start_date: '2026-07-01', end_date: '2026-12-31', invoice_month_offset: 1 }
const OTHER:   ContractForDelivery = { id: 'c-x', product_id: 'p-other', start_date: '2026-01-01', end_date: '2026-12-31', invoice_month_offset: 0 }

describe('parseTonsToKg', () => {
  it('소수 3자리 톤을 kg 정수로', () => {
    expect(parseTonsToKg('202.905')).toEqual({ ok: true, value: 202905 })
    expect(parseTonsToKg('1,330.846')).toEqual({ ok: true, value: 1330846 })
  })
  it('0·음수·문자·소수 4자리는 거부', () => {
    for (const bad of ['0', '-1', 'abc', '', '1.2345', '1e3']) {
      expect(parseTonsToKg(bad).ok).toBe(false)
    }
  })
})

describe('buildDeliveryRows', () => {
  const base = { deliveryDate: '2026-10-31', productId: 'p-al35b', memo: null, contracts: [AL35B_A, AL35B_B, OTHER] }

  it('매입단가 2개 품목을 한 번에 — 납품월·청구월은 계약 오프셋으로 서버가 만든다', () => {
    const r = buildDeliveryRows({ ...base, lines: [{ contractId: 'c-a', tons: '202.905' }, { contractId: 'c-b', tons: '130.846' }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(2)
    expect(r.value.every(x => x.year_month === '2026-10' && x.invoice_month === '2026-11')).toBe(true)
    expect(r.value.map(x => x.quantity_kg)).toEqual([202905, 130846])
    expect(r.value.every(x => x.depreciation_amount === null)).toBe(true)
  })

  it('두 단가의 청구월 오프셋이 다르면 거부 (analytics 한쪽 누락 방지)', () => {
    const r = buildDeliveryRows({
      ...base,
      contracts: [AL35B_A, { ...AL35B_B, invoice_month_offset: 2 }],
      lines: [{ contractId: 'c-a', tons: '1' }, { contractId: 'c-b', tons: '1' }],
    })
    expect(r.ok).toBe(false)
  })

  it('다른 품목의 단가·기간 밖 단가·같은 단가 두 번은 거부', () => {
    expect(buildDeliveryRows({ ...base, lines: [{ contractId: 'c-x', tons: '1' }] }).ok).toBe(false)
    expect(buildDeliveryRows({ ...base, deliveryDate: '2026-06-30', lines: [{ contractId: 'c-a', tons: '1' }] }).ok).toBe(false)
    expect(buildDeliveryRows({ ...base, lines: [{ contractId: 'c-a', tons: '1' }, { contractId: 'c-a', tons: '2' }] }).ok).toBe(false)
  })

  it('한 줄이라도 물량이 잘못되면 전체 거부 (일부만 저장 금지)', () => {
    const r = buildDeliveryRows({ ...base, lines: [{ contractId: 'c-a', tons: '10' }, { contractId: 'c-b', tons: '-3' }] })
    expect(r.ok).toBe(false)
  })
})

describe('duplicateLines / invoiceMonthConflict', () => {
  it('같은 단가·같은 납품월이 이미 있으면 중복 후보', () => {
    const existing = [
      { id: 'd1', contract_id: 'c-a', year_month: '2026-10' },
      { id: 'd2', contract_id: 'c-a', year_month: '2026-09' },
    ]
    expect(duplicateLines(existing, [{ contract_id: 'c-a', year_month: '2026-10' }]).map(d => d.id)).toEqual(['d1'])
    expect(duplicateLines(existing, [{ contract_id: 'c-b', year_month: '2026-10' }])).toEqual([])
  })
  it('청구월이 하나면 충돌 없음', () => {
    expect(invoiceMonthConflict(['2026-11', '2026-11'])).toBeNull()
    expect(invoiceMonthConflict(['2026-11', '2026-12'])).not.toBeNull()
  })
})
