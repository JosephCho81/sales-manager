export type InvoiceRow = {
  id: string
  year_month: string
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
  memo: string | null
  invoice_type: string | null
}
