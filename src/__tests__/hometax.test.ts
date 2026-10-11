import { describe, it, expect } from 'vitest'
import {
  isValidBizNo, hometaxBytes, hometaxIssuers, hometaxItemName, planHometaxExport, hometaxSheetRows,
  type CompanyInfo,
} from '@/lib/hometax'
import { HOMETAX_HEADERS, HOMETAX_REQUIRED_COLS } from '@/lib/hometax-template'
import type { InvoiceRow } from '@/lib/invoice-generator'
import { hometaxIssuerLockFor } from '@/lib/account'

// 검증번호가 맞는 실존 형식 번호 (테스트 전용)
const VALID_A = '2208162517'
const VALID_B = '1048137225'

function inv(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 'i1',
    year_month: '2026-10',
    delivery_year_month: '2026-09',
    product_id: 'p-sogoe',
    delivery_ids: ['d1'],
    from_company: '(주)한국에이원',
    to_company: '(주)나성',
    supply_amount: 5_161_107,
    vat_amount: 516_110,
    total_amount: 5_677_217,
    invoice_basis_date: '2026-10-08',
    issue_deadline: '2026-10-08',
    payment_due_date: '2026-10-08',
    is_paid: false,
    paid_at: null,
    paid_amount: null,
    actual_supply_amount: null,
    actual_vat_amount: null,
    reconciled_at: null,
    reconcile_memo: null,
    memo: '(주)나성 커미션 (나머지)',
    invoice_type: 'commission',
    ...overrides,
  }
}

function company(name: string, biz_no: string, overrides: Partial<CompanyInfo> = {}): CompanyInfo {
  return {
    name, biz_no, trade_name: name, ceo_name: '대표', address: '서울시', biz_type: '도소매', biz_item: '원료',
    email: 'a@b.co', ...overrides,
  }
}

const companies = [company('(주)나성', VALID_A), company('(주)한국에이원', VALID_B)]
const productNames = new Map([['p-sogoe', '소괴탄']])

describe('isValidBizNo', () => {
  it('검증번호가 맞으면 true', () => {
    expect(isValidBizNo(VALID_A)).toBe(true)
    expect(isValidBizNo(VALID_B)).toBe(true)
  })
  it('마지막 자리 틀림·하이픈·자릿수 오류는 false', () => {
    expect(isValidBizNo('2208162518')).toBe(false)
    expect(isValidBizNo('220-81-62517')).toBe(false)
    expect(isValidBizNo('220816251')).toBe(false)
  })
})

describe('hometaxBytes', () => {
  it('한글 2byte, 영문·숫자 1byte', () => {
    expect(hometaxBytes('ab1')).toBe(3)
    expect(hometaxBytes('나성')).toBe(4)
    expect(hometaxBytes('(주)나성')).toBe(8)
  })
})

describe('hometaxIssuers', () => {
  it('한국에이원이 지급하는 커미션의 수취 회사만', () => {
    const list = hometaxIssuers([
      inv(),
      inv({ id: 'g', to_company: '금화' }),
      inv({ id: 's', invoice_type: 'sales', from_company: '동국제강', to_company: '(주)한국에이원' }),
      inv({ id: 'h', from_company: '화림', to_company: '(주)한국에이원' }),
    ])
    expect(list).toEqual(['(주)나성', '금화'])
  })
  it('발행 회사가 정해진 계정(나성)은 자기 회사만', () => {
    const invoices = [inv(), inv({ id: 'g', to_company: '(주)금화' })]
    expect(hometaxIssuers(invoices, hometaxIssuerLockFor('kim'))).toEqual(['(주)나성'])
    expect(hometaxIssuers(invoices, hometaxIssuerLockFor('cho'))).toEqual(['(주)금화', '(주)나성'])
  })
})

describe('hometaxItemName', () => {
  it('품목 커미션은 납품월 + 품목명', () => {
    expect(hometaxItemName(inv(), productNames)).toBe('9월분 소괴탄 커미션')
  })
  it('동국/현대 커미션은 memo의 회사명', () => {
    expect(hometaxItemName(inv({ product_id: null, delivery_year_month: '2026-07', memo: '2026년 07월 동국제강 커미션 — (주)나성 1/3' }), productNames))
      .toBe('7월분 동국제강 커미션')
  })
})

describe('planHometaxExport', () => {
  const base = { issuer: '(주)나성', companies, productNames }

  it('발행 지시 금액을 다시 계산하지 않고 그대로 옮긴다 (라인별 VAT 보존)', () => {
    // 감가 반영 커미션: 일괄 10%면 516,111이지만 실물은 516,110
    const plan = planHometaxExport({ ...base, invoices: [inv()] })
    expect(plan.errors).toEqual([])
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]).toMatchObject({ supply: 5_161_107, vat: 516_110, writeDate: '20261008' })
  })

  it('다른 회사·다른 유형 계산서는 넣지 않는다', () => {
    const plan = planHometaxExport({ ...base, invoices: [
      inv(), inv({ id: 'g', to_company: '금화' }),
      inv({ id: 'c', invoice_type: 'cost', from_company: '(주)한국에이원', to_company: '(주)나성' }),
    ] })
    expect(plan.rows.map(r => r.invoiceId)).toEqual(['i1'])
  })

  it('선택한 계산서만 넣고, 고르지 않은 건의 오류는 막지 않는다', () => {
    const plan = planHometaxExport({ ...base, invoiceIds: new Set(['i1']), invoices: [
      inv(), inv({ id: 'bad', total_amount: 1 }),
    ] })
    expect(plan.errors).toEqual([])
    expect(plan.rows.map(r => r.invoiceId)).toEqual(['i1'])
  })
  it('아무것도 고르지 않았거나 대상이 아닌 id를 고르면 에러', () => {
    expect(planHometaxExport({ ...base, invoiceIds: new Set(), invoices: [inv()] }).errors)
      .toEqual(['받을 계산서를 하나 이상 선택하세요.'])
    const plan = planHometaxExport({ ...base, invoiceIds: new Set(['i1', 'other']), invoices: [
      inv(), inv({ id: 'other', to_company: '(주)금화' }),
    ] })
    expect(plan.errors[0]).toMatch(/1건이/)
  })
  it('실물 대사가 끝난 건은 중복 발급 방지로 건너뛴다', () => {
    const plan = planHometaxExport({ ...base, invoices: [inv(), inv({ id: 'done', reconciled_at: '2026-10-09T00:00:00Z' })] })
    expect(plan.rows.map(r => r.invoiceId)).toEqual(['i1'])
    expect(plan.skipped.map(s => s.invoice.id)).toEqual(['done'])
  })

  it('전부 발행됐으면 에러 — 빈 파일을 만들지 않는다', () => {
    const plan = planHometaxExport({ ...base, invoices: [inv({ reconciled_at: '2026-10-09T00:00:00Z' })] })
    expect(plan.errors.length).toBeGreaterThan(0)
  })

  it('사업자정보 누락·검증번호 오류는 에러', () => {
    expect(planHometaxExport({ ...base, companies: [companies[0]], invoices: [inv()] }).errors[0])
      .toContain('(주)한국에이원')
    const bad = planHometaxExport({ ...base, companies: [company('(주)나성', '2208162518'), companies[1]], invoices: [inv()] })
    expect(bad.errors.join()).toContain('사업자등록번호')
  })

  it('공급가 + 세액 ≠ 합계면 에러', () => {
    const plan = planHometaxExport({ ...base, invoices: [inv({ total_amount: 5_677_218 })] })
    expect(plan.errors.join()).toContain('합계')
    expect(plan.rows).toHaveLength(0)
  })

  it('음수·소수 금액은 에러', () => {
    expect(planHometaxExport({ ...base, invoices: [inv({ supply_amount: -1, total_amount: 516_109 })] }).errors.length).toBeGreaterThan(0)
    expect(planHometaxExport({ ...base, invoices: [inv({ supply_amount: 10.5, vat_amount: 1, total_amount: 11.5 })] }).errors.length).toBeGreaterThan(0)
  })

  it('바이트 한도 초과는 에러', () => {
    const plan = planHometaxExport({ ...base, companies: [company('(주)나성', VALID_A, { ceo_name: '가'.repeat(16) }), companies[1]], invoices: [inv()] })
    expect(plan.errors.join()).toContain('성명')
  })
})

describe('hometaxSheetRows', () => {
  it('59열, 필수 칸이 모두 채워지고 코드값은 앞자리 0을 유지한 문자열', () => {
    const plan = planHometaxExport({ issuer: '(주)나성', companies, productNames, invoices: [inv()] })
    const [row] = hometaxSheetRows(plan.rows)
    expect(row).toHaveLength(HOMETAX_HEADERS.length)
    expect(HOMETAX_HEADERS).toHaveLength(59)
    for (const c of HOMETAX_REQUIRED_COLS) expect(row[c], `열 ${c}`).not.toBe('')
    expect(row[0]).toBe('01')
    expect(row[2]).toBe(VALID_A)       // 공급자 = 나성
    expect(row[10]).toBe(VALID_B)      // 공급받는자 = 한국에이원
    expect(row[19]).toBe('5161107')
    expect(row[20]).toBe('516110')
    expect(row[22]).toBe('08')
    expect(row[23]).toBe('9월분 소괴탄 커미션')
    expect(row[27]).toBe('5161107')
    expect(row[28]).toBe('516110')
    expect(row[58]).toBe('02')
  })
})

describe('buildHometaxWorkbook', () => {
  it('7행부터 데이터, 코드값은 텍스트 셀로 앞자리 0 유지', async () => {
    const ExcelJS = (await import('exceljs')).default
    const { buildHometaxWorkbook } = await import('@/lib/hometax-xlsx')
    const plan = planHometaxExport({ issuer: '(주)나성', companies, productNames, invoices: [inv()] })
    const buf = await buildHometaxWorkbook(hometaxSheetRows(plan.rows))

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.getWorksheet('엑셀업로드양식')!
    expect(ws.getCell(6, 1).value).toBe(HOMETAX_HEADERS[0])
    expect(ws.getCell(6, 59).value).toBe(HOMETAX_HEADERS[58])
    expect(ws.getCell(7, 1).value).toBe('01')
    expect(ws.getCell(7, 23).value).toBe('08')
    expect(ws.getCell(7, 59).value).toBe('02')
    expect(ws.getCell(7, 20).value).toBe('5161107')
    expect(ws.getCell(8, 1).value).toBeNull()
  }, 30_000)   // exceljs 첫 로드가 느려 기본 5초를 넘길 수 있다
})
