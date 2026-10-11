/**
 * 홈택스 엑셀 일괄발급 — 순수 변환·검증 (클라이언트에서도 import 가능).
 *
 * 대상은 한국에이원이 지급하는 커미션 계산서뿐이다(금화·나성이 공급자, 한국에이원이 공급받는자).
 * 매출·매입 행은 from/to가 품목마다 공급자/지급자 의미가 섞여 있어(coal: from=지급자,
 * al-series 화림·금화 행: from=공급자) 공급자를 결정적으로 못 정한다 — 넣지 않는다.
 *
 * 금액은 발행 지시의 공급가액·세액을 그대로 옮긴다. 다시 계산하지 않는다 —
 * 감가 반영 커미션은 라인별 부가세(commVat)라 일괄 10%로 다시 매기면 1원 어긋난다.
 */
import type { InvoiceRow } from '@/lib/invoice-generator/types'
import { HOMETAX_HEADERS } from '@/lib/hometax-template'

export type CompanyInfo = {
  /** invoice_instructions.from_company/to_company와 같은 문자열 */
  name: string
  biz_no: string
  trade_name: string
  ceo_name: string
  address: string
  biz_type: string
  biz_item: string
  email: string
}

/** 사업자정보 입력 대상 — 커미션 계산서의 양쪽 당사자 */
export const COMMISSION_PAYER = '(주)한국에이원'
export const HOMETAX_COMPANY_NAMES: readonly string[] = [COMMISSION_PAYER, '(주)나성', '금화']

/** 홈택스 업로드 1회 한도 */
export const HOMETAX_MAX_ROWS = 100

/** 영수(01)/청구(02) — 커미션은 발급일(=지급일)에 계산서를 먼저 받고 송금하므로 청구 */
const RECEIPT_TYPE_CLAIM = '02'

/** 항목설명 시트의 바이트 한도 (한글 2byte) */
const BYTE_LIMITS: Array<[keyof CompanyInfo, string, number]> = [
  ['trade_name', '상호', 70],
  ['ceo_name', '성명', 30],
  ['address', '사업장주소', 150],
  ['biz_type', '업태', 40],
  ['biz_item', '종목', 60],
  ['email', '이메일', 40],
]
const ITEM_BYTE_LIMIT = 100

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 사업자등록번호 검증번호 확인 (하이픈 없는 10자리) */
export function isValidBizNo(bizNo: string): boolean {
  if (!/^\d{10}$/.test(bizNo)) return false
  const d = bizNo.split('').map(Number)
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]
  let sum = 0
  for (let i = 0; i < 9; i++) sum += d[i] * w[i]
  sum += Math.floor((d[8] * 5) / 10)
  return (10 - (sum % 10)) % 10 === d[9]
}

/** 홈택스 길이 기준 — 영문·숫자 1byte, 그 외 2byte */
export function hometaxBytes(s: string): number {
  let n = 0
  for (const ch of s) n += ch.charCodeAt(0) <= 0x7f ? 1 : 2
  return n
}

/** 이 달 발행 지시 중 엑셀로 낼 수 있는 공급자(커미션 수취 회사) 목록 */
export function hometaxIssuers(invoices: InvoiceRow[]): string[] {
  const set = new Set<string>()
  for (const inv of invoices) {
    if (inv.invoice_type === 'commission' && inv.from_company === COMMISSION_PAYER) set.add(inv.to_company)
  }
  return [...set].sort()
}

export type HometaxRow = {
  invoiceId: string
  writeDate: string      // YYYYMMDD
  supplier: CompanyInfo
  buyer: CompanyInfo
  supply: number
  vat: number
  item: string
}

export type HometaxPlan = {
  rows: HometaxRow[]
  /** 대상이지만 이미 발행된 것으로 보이는 건 — 중복 발급 방지 */
  skipped: Array<{ invoice: InvoiceRow; reason: string }>
  /** 하나라도 있으면 파일을 만들지 않는다 */
  errors: string[]
}

export function companyErrors(c: CompanyInfo | undefined, role: string, name: string): string[] {
  if (!c) return [`${role} '${name}' 사업자정보가 없습니다. 품목 설정 → 거래처 사업자정보에서 입력하세요.`]
  const errs: string[] = []
  if (!isValidBizNo(c.biz_no)) errs.push(`${role} '${name}' 사업자등록번호가 올바르지 않습니다 (${c.biz_no || '빈 값'}).`)
  if (!c.trade_name.trim()) errs.push(`${role} '${name}' 상호가 비어 있습니다.`)
  if (!c.ceo_name.trim()) errs.push(`${role} '${name}' 대표자 성명이 비어 있습니다.`)
  if (c.email && !EMAIL_RE.test(c.email)) errs.push(`${role} '${name}' 이메일 형식이 올바르지 않습니다.`)
  for (const [key, label, limit] of BYTE_LIMITS) {
    const b = hometaxBytes(c[key])
    if (b > limit) errs.push(`${role} '${name}' ${label}이(가) 너무 깁니다 (${b}/${limit}byte).`)
  }
  return errs
}

/** 품목명 — 예: "9월분 소괴탄 커미션", "7월분 동국제강 커미션" */
export function hometaxItemName(inv: InvoiceRow, productNames: Map<string, string>): string {
  const ym = inv.delivery_year_month ?? inv.year_month
  const month = Number(ym.slice(5, 7))
  const source = inv.product_id
    ? productNames.get(inv.product_id)
    : inv.memo?.match(/동국제강|현대제철/)?.[0]
  return `${month}월분 ${source ? source + ' ' : ''}커미션`
}

export function planHometaxExport(p: {
  invoices: InvoiceRow[]
  issuer: string
  companies: CompanyInfo[]
  productNames: Map<string, string>
}): HometaxPlan {
  const byName = new Map(p.companies.map(c => [c.name, c]))
  const targets = p.invoices.filter(inv =>
    inv.invoice_type === 'commission' && inv.from_company === COMMISSION_PAYER && inv.to_company === p.issuer)

  const errors: string[] = []
  const skipped: HometaxPlan['skipped'] = []
  const rows: HometaxRow[] = []

  const supplier = byName.get(p.issuer)
  const buyer = byName.get(COMMISSION_PAYER)
  errors.push(...companyErrors(supplier, '공급자', p.issuer))
  errors.push(...companyErrors(buyer, '공급받는자', COMMISSION_PAYER))

  for (const inv of targets) {
    if (inv.reconciled_at) {
      skipped.push({ invoice: inv, reason: '실물 대사 완료 — 이미 발행된 계산서' })
      continue
    }
    const label = `${inv.memo ?? inv.id}`
    const supply = Number(inv.supply_amount)
    const vat = Number(inv.vat_amount)
    const total = Number(inv.total_amount)
    if (!Number.isInteger(supply) || !Number.isInteger(vat) || supply <= 0 || vat < 0) {
      errors.push(`[${label}] 금액이 올바르지 않습니다 (공급가 ${supply}, 세액 ${vat}).`)
      continue
    }
    if (supply + vat !== total) {
      errors.push(`[${label}] 공급가 + 세액(${supply + vat})이 합계(${total})와 다릅니다.`)
      continue
    }
    const date = inv.invoice_basis_date
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`[${label}] 발행기준일이 없습니다.`)
      continue
    }
    const item = hometaxItemName(inv, p.productNames)
    if (hometaxBytes(item) > ITEM_BYTE_LIMIT) {
      errors.push(`[${label}] 품목명이 너무 깁니다.`)
      continue
    }
    if (supplier && buyer) {
      rows.push({ invoiceId: inv.id, writeDate: date.replaceAll('-', ''), supplier, buyer, supply, vat, item })
    }
  }

  if (targets.length === 0) errors.push(`이 달에 '${p.issuer}' 커미션 계산서가 없습니다.`)
  else if (rows.length === 0 && errors.length === 0) errors.push('발행할 계산서가 없습니다 (모두 이미 발행됨).')
  if (rows.length > HOMETAX_MAX_ROWS) errors.push(`홈택스는 한 번에 ${HOMETAX_MAX_ROWS}건까지만 올릴 수 있습니다.`)

  return { rows, skipped, errors }
}

/**
 * 시트 7행부터 들어갈 값 (59열). 모든 칸을 문자열로 둔다 —
 * 숫자로 넣으면 엑셀이 '01'·'02'·사업자번호 앞자리 0을 지운다.
 */
export function hometaxSheetRows(rows: HometaxRow[]): string[][] {
  return rows.map(r => {
    const cells = new Array<string>(HOMETAX_HEADERS.length).fill('')
    const s = r.supplier
    const b = r.buyer
    cells.splice(0, 22, '01', r.writeDate,
      s.biz_no, '', s.trade_name, s.ceo_name, s.address, s.biz_type, s.biz_item, s.email,
      b.biz_no, '', b.trade_name, b.ceo_name, b.address, b.biz_type, b.biz_item, b.email, '',
      String(r.supply), String(r.vat), '')
    // 품목1 — 일자는 작성일의 일(2자리)
    cells.splice(22, 8, r.writeDate.slice(6, 8), r.item, '', '', '', String(r.supply), String(r.vat), '')
    cells[58] = RECEIPT_TYPE_CLAIM
    return cells
  })
}
