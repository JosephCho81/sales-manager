export type ShortageEntry = {
  id: string
  year_month: string
  quantity_kg: number
  sell_price: number
  commission_amount: number
  memo: string | null
  created_at: string
}

export type HyundaiInvoiceRow = {
  id: string
  year_month: string
  from_company: string
  to_company: string
  supply_amount: number
  vat_amount: number
  total_amount: number
  invoice_basis_date: string | null
  payment_due_date: string | null
  is_paid: boolean
  invoice_type: string | null
  memo: string | null
}

export type HyundaiDeliveryRow = {
  id: string
  year_month: string
  delivery_date: string | null
  product_id: string
  quantity_kg: number
  addl_quantity_kg: number | null
  addl_margin_per_ton: number | null
  memo: string | null
  contract: {
    sell_price: number; cost_price: number
    currency: string; reference_exchange_rate: number | null
  } | null
}
