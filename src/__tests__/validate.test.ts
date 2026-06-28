import { describe, it, expect } from 'vitest'
import { validateContract } from '@/app/(protected)/contracts/validate'
import type { ContractFormState, ContractRow } from '@/app/(protected)/contracts/types'

// ── 헬퍼 ─────────────────────────────────────────────────

function makeForm(overrides: Partial<ContractFormState> = {}): ContractFormState {
  return {
    product_id: 'prod-1',
    start_date: '2024-01-01',
    end_date: '2024-06-30',
    sell_price: '1900000',
    cost_price: '1800000',
    reference_exchange_rate: '',
    exchange_rate_basis: '',
    memo: '',
    ...overrides,
  }
}

function makeExisting(overrides: Partial<ContractRow> = {}): ContractRow {
  return {
    id: 'existing-1',
    product_id: 'prod-1',
    start_date: '2024-01-01',
    end_date: '2024-06-30',
    sell_price: 1900000,
    cost_price: 1800000,
    currency: 'KRW',
    reference_exchange_rate: null,
    exchange_rate_basis: null,
    memo: null,
    created_at: '2024-01-01T00:00:00Z',
    invoice_month_offset: 0,
    revision_reason: null,
    revised_at: null,
    supersedes_contract_id: null,
    updated_at: null,
    product: { id: 'prod-1', name: 'AL35B', display_name: 'AL35B', price_unit: 'KRW_TON' },
    ...overrides,
  }
}

// ── validateContract ──────────────────────────────────────

describe('validateContract', () => {

  // ── 필드 유효성 검사 ──────────────────────────────────
  describe('필드 유효성 검사', () => {
    it('품목 미선택 → 에러', () => {
      expect(validateContract(makeForm({ product_id: '' }), false, []))
        .toBe('품목을 선택하세요.')
    })

    it('시작일 비어있으면 → 에러', () => {
      expect(validateContract(makeForm({ start_date: '' }), false, [])).toBeTruthy()
    })

    it('종료일 비어있으면 → 에러', () => {
      expect(validateContract(makeForm({ end_date: '' }), false, [])).toBeTruthy()
    })

    it('종료일 = 시작일 → 에러', () => {
      expect(validateContract(
        makeForm({ start_date: '2024-03-01', end_date: '2024-03-01' }),
        false, []
      )).toBeTruthy()
    })

    it('종료일 < 시작일 → 에러', () => {
      expect(validateContract(
        makeForm({ start_date: '2024-06-30', end_date: '2024-01-01' }),
        false, []
      )).toBeTruthy()
    })

    it('판매단가 비어있으면 → 에러', () => {
      expect(validateContract(makeForm({ sell_price: '' }), false, [])).toBeTruthy()
    })

    it('원가단가 비어있으면 → 에러', () => {
      expect(validateContract(makeForm({ cost_price: '' }), false, [])).toBeTruthy()
    })

    it('판매단가 음수 → 에러', () => {
      expect(validateContract(makeForm({ sell_price: '-1' }), false, []))
        .toBe('판매단가는 0보다 커야 합니다.')
    })

    it('판매단가 0 → 에러', () => {
      expect(validateContract(makeForm({ sell_price: '0' }), false, []))
        .toBe('판매단가는 0보다 커야 합니다.')
    })

    it('원가단가 음수 → 에러', () => {
      expect(validateContract(makeForm({ cost_price: '-1' }), false, []))
        .toBe('원가단가는 0보다 커야 합니다.')
    })

    it('원가단가 0 → 에러', () => {
      expect(validateContract(makeForm({ cost_price: '0' }), false, []))
        .toBe('원가단가는 0보다 커야 합니다.')
    })

    it('USD 품목, 참고환율 없으면 → 에러', () => {
      expect(validateContract(
        makeForm({ reference_exchange_rate: '' }),
        true, []
      )).toBeTruthy()
    })

    it('유효한 KRW 폼, 기존 계약 없음 → null', () => {
      expect(validateContract(makeForm(), false, [])).toBeNull()
    })
  })

  // ── 기간 중복 검사 ────────────────────────────────────
  describe('기간 중복 검사', () => {
    it('완전히 동일한 기간 → 중복 에러', () => {
      // form: 2024-01-01 ~ 2024-06-30 (makeForm 기본값)
      // existing: 2024-01-01 ~ 2024-06-30 (makeExisting 기본값)
      const result = validateContract(makeForm(), false, [makeExisting()])
      expect(result).toContain('기간이 겹칩니다')
    })

    it('하루 겹침(경계) → 에러', () => {
      // form:     2024-03-31 ~ 2024-09-30
      // existing: 2024-01-01 ~ 2024-04-01
      // form.start('2024-03-31') < existing.end('2024-04-01') → true
      // form.end('2024-09-30')   > existing.start('2024-01-01') → true  → 겹침
      const existing = makeExisting({ start_date: '2024-01-01', end_date: '2024-04-01' })
      const result = validateContract(
        makeForm({ start_date: '2024-03-31', end_date: '2024-09-30' }),
        false, [existing]
      )
      expect(result).toContain('기간이 겹칩니다')
    })

    it('인접 기간 (기존 종료일 = 새 시작일) → 통과', () => {
      // form:     2024-07-01 ~ 2024-12-31
      // existing: 2024-01-01 ~ 2024-07-01
      // form.start('2024-07-01') < existing.end('2024-07-01') → false → 겹침 없음
      const existing = makeExisting({ start_date: '2024-01-01', end_date: '2024-07-01' })
      const result = validateContract(
        makeForm({ start_date: '2024-07-01', end_date: '2024-12-31' }),
        false, [existing]
      )
      expect(result).toBeNull()
    })

    it('같은 품목, 겹치지 않는 이전 기간 → 통과', () => {
      // form:     2024-07-01 ~ 2024-12-31
      // existing: 2024-01-01 ~ 2024-06-30
      // form.start('2024-07-01') < existing.end('2024-06-30') → false → 겹침 없음
      const existing = makeExisting({ start_date: '2024-01-01', end_date: '2024-06-30' })
      const result = validateContract(
        makeForm({ start_date: '2024-07-01', end_date: '2024-12-31' }),
        false, [existing]
      )
      expect(result).toBeNull()
    })

    it('다른 품목, 같은 기간 → 통과', () => {
      // product_id 불일치 → 겹침 체크 스킵
      const existing = makeExisting({ product_id: 'prod-2' })
      const result = validateContract(makeForm({ product_id: 'prod-1' }), false, [existing])
      expect(result).toBeNull()
    })

    it('수정 시 자기 자신 기간 → 통과 (editId로 제외)', () => {
      const existing = makeExisting({ id: 'self-id' })
      const result = validateContract(makeForm(), false, [existing], 'self-id')
      expect(result).toBeNull()
    })
  })
})
