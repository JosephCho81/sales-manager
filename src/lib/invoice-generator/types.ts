export type InvoiceType = 'sales' | 'cost' | 'commission' | 'other'

export interface DeliveryForInvoice {
  id: string
  year_month: string
  delivery_date: string | null
  product_id: string
  product_name: string
  product_vat: string         // 'TEN_PERCENT' | 'NONE'
  quantity_kg: number
  /** 감가 금액 (원) — 소괴탄/분탄 전용, 동국제강 지정 */
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

export interface InvoiceToCreate {
  year_month: string
  delivery_year_month: string | null
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
