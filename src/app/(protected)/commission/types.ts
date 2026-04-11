export type CommissionRow = {
  id: string
  year_month: string
  company: '동국제강' | '현대제철'
  quantity_kg: number
  price_per_ton: number
  commission_amount: number
  memo: string | null
  created_at: string
}
