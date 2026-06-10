export type ExpensePayer = 'korea_a1' | 'raseong' | 'geumhwa'

export const EXPENSE_PAYERS: ExpensePayer[] = ['korea_a1', 'raseong', 'geumhwa']

export const EXPENSE_PAYER_LABELS: Record<ExpensePayer, string> = {
  korea_a1: '한국에이원',
  raseong: '나성',
  geumhwa: '금화',
}

export interface Expense {
  id: string
  date: string
  description: string
  amount: number
  note: string | null
  payer: ExpensePayer | null
  is_settled: boolean
  created_at: string
}
