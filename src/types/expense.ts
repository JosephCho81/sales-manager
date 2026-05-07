export interface Expense {
  id: string
  date: string
  description: string
  amount: number
  note: string | null
  is_settled: boolean
  created_at: string
}
