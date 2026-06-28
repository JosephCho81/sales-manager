import { type Dispatch, type SetStateAction } from 'react'
import type { Expense, ExpensePayer } from '@/types'
import type { EditForm } from './useExpenses'

/** ExpenseCard(모바일) / ExpenseTableRow(데스크톱) 공용 props */
export interface ExpenseRowProps {
  row: Expense
  editing: boolean
  editForm: EditForm
  setEditForm: Dispatch<SetStateAction<EditForm>>
  startEdit: (row: Expense) => void
  handleToggle: (row: Expense) => void
  handleDelete: (id: string) => void
  handleUpdate: () => void
  handlePayerChange: (row: Expense, payer: ExpensePayer | null) => void
}
