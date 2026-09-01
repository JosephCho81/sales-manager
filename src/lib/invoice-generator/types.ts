// ── 계산서 타입 ──
export type InvoiceType = 'sales' | 'cost' | 'commission' | 'other'

// ── 계산서 생성용 입력 타입 ──
export interface DeliveryForInvoice {
  id: string
  year_month: string
  delivery_date: string | null
  product_id: string
  product_name: string
  product_vat: string           // 'TEN_PERCENT' | 'NONE'
  quantity_kg: number
  /** 감가 금액(원) — 소괴탄/분탄 전용 */
  depreciation_amount: number | null
  /** FeSi BL 날짜 기준 실제 환율 (원/USD) */
  fx_rate: number | null
  contract: {
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
  }
}

// ── 계산서 생성 결과 타입 ──
export interface InvoiceToCreate {
  year_month: string
  delivery_year_month: string | null
  product_id: string | null   // null = 커미션 등 품목 없는 계산서
  delivery_ids: string[]
  from_company: string
  to_company: string
  supply_amount: number
  vat_amount: number
  total_amount: number
  invoice_basis_date: string
  issue_deadline: string
  payment_due_date: string
  is_paid: boolean
  invoice_type: InvoiceType
  memo: string
}

// ── DB invoice_instructions 행 타입 ──
export type InvoiceRow = {
  id: string
  year_month: string
  delivery_year_month: string | null
  product_id: string | null
  delivery_ids: string[] | null
  from_company: string
  to_company: string
  supply_amount: number
  vat_amount: number
  total_amount: number
  invoice_basis_date: string | null
  issue_deadline: string | null
  payment_due_date: string | null
  is_paid: boolean
  paid_at: string | null
  /** 실입금/실지급액. null = total_amount와 동일 */
  paid_amount: number | null
  /** 실물 세금계산서 공급가액. null = 아직 대사 안 함 (020) */
  actual_supply_amount: number | null
  /** 실물 세금계산서 부가세 */
  actual_vat_amount: number | null
  /** 대사 완료 시각. null = 미대사 */
  reconciled_at: string | null
  reconcile_memo: string | null
  memo: string | null
  invoice_type: string | null
}

// ── 월별 감가 차감분 ──
/**
 * 계산서 한 장에서 차감할 감가 조각.
 *
 * `amount`(계산서에서 빼는 금액)와 `marginAmount`(3사 배분에 반영하는 금액)를 분리한 이유:
 *   보관형(분탄) — 매입만 차감하지만 커미션은 총액 기준 유지 → marginAmount = 0
 *                  (감가액이 배분에서 빠져 통장에 남고, 계약 종료 후 공급처에 반환)
 *   통과형(AL30·소괴탄) — 매출 감액·매입 회수가 그대로 마진을 움직임 → marginAmount = amount
 * 기본값을 두면 한쪽을 조용히 틀리게 만들므로 필수 필드로 둔다.
 */
export type DepSlice = {
  /** 계산서 공급가액에서 차감할 금액 */
  amount: number
  /** 감가 귀속 납품월 목록 (메모 표기용) */
  originYMs: string[]
  /** 마진(=3사 커미션 배분)에 반영할 금액. 보관형은 0 */
  marginAmount: number
  /** 감가 반영 계산서의 실물 부가세. null/미지정이면 라인별 계산값 */
  vatActual?: number | null
}

export const NO_DEP: DepSlice = { amount: 0, originYMs: [], marginAmount: 0, vatActual: null }
