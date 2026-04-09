export type InvoiceType = 'sales' | 'cost' | 'commission' | 'other'

export interface DeliveryForInvoice {
  id: string
  year_month: string
  delivery_date: string | null
  product_id: string
  product_name: string
  product_vat: string         // 'TEN_PERCENT' | 'NONE'
  quantity_kg: number
  addl_quantity_kg: number | null
  addl_margin_per_ton: number | null
  /** 호진 부족분 물량 (kg) — AL35B 전용 */
  hoejin_shortage_kg: number | null
  /** 호진 부족분 단가 (원/톤, 화림 통보) — AL35B 전용 */
  hoejin_shortage_price: number | null
  /** 감가 물량 (kg) — 소괴탄/분탄 전용 */
  depreciation_kg: number | null
  /** FeSi BL 날짜 기준 실제 환율 (원/USD) */
  fx_rate: number | null
  contract: {
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
  }
}

export interface InvoiceToCreate {
  year_month: string
  product_id: string
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
