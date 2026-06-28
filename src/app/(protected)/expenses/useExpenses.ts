'use client'

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react'
import { toMessage } from '@/lib/error'
import { insertExpense, toggleSettled, updateExpense, updatePayer, deleteExpense } from './actions'
import { type Expense, type ExpensePayer } from '@/types'
import {
  computeSettlement, computeUnassignedTotal, computeTransfers,
  validateExpenseInput, validateExpenseEdit,
  type PayerSettlement, type Transfer,
} from './expense-settlement'

export type { PayerSettlement, Transfer }

function sortRows(rows: Expense[]): Expense[] {
  return [...rows].sort((a, b) => {
    if (a.is_settled !== b.is_settled) return a.is_settled ? 1 : -1
    return b.date.localeCompare(a.date)
  })
}

type ExpensesForm = { date: string; description: string; amount: string; payer: '' | ExpensePayer; note: string }
export type EditForm = { date: string; description: string; amount: string; note: string }

interface ExpensesReturn {
  rows: Expense[]
  form: ExpensesForm
  setForm: Dispatch<SetStateAction<ExpensesForm>>
  saving: boolean
  error: string | null
  unsettledTotal: number
  settlement: Record<ExpensePayer, PayerSettlement>
  transfers: Transfer[]
  unassignedTotal: number
  detailPayer: ExpensePayer | null
  setDetailPayer: Dispatch<SetStateAction<ExpensePayer | null>>
  detailRows: Expense[]
  editingId: string | null
  editForm: EditForm
  setEditForm: Dispatch<SetStateAction<EditForm>>
  startEdit: (row: Expense) => void
  handleUpdate: () => Promise<void>
  handleSave: () => Promise<void>
  handleToggle: (row: Expense) => Promise<void>
  handlePayerChange: (row: Expense, payer: ExpensePayer | null) => Promise<void>
  handleDelete: (id: string) => Promise<void>
}

export function useExpenses(initialRows: Expense[]): ExpensesReturn {
  const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD
  const [rows, setRows] = useState<Expense[]>(initialRows)
  const [form, setForm] = useState<ExpensesForm>({ date: today, description: '', amount: '', payer: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailPayer, setDetailPayer] = useState<ExpensePayer | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ date: '', description: '', amount: '', note: '' })

  const unsettledRows = useMemo(() => rows.filter(r => !r.is_settled), [rows])

  const unsettledTotal = useMemo(
    () => unsettledRows.reduce((s, r) => s + r.amount, 0),
    [unsettledRows]
  )

  const settlement = useMemo(() => computeSettlement(unsettledRows), [unsettledRows])

  const unassignedTotal = useMemo(() => computeUnassignedTotal(unsettledRows), [unsettledRows])

  const transfers = useMemo(() => computeTransfers(settlement), [settlement])

  const detailRows = useMemo(
    () => (detailPayer ? unsettledRows.filter(r => r.payer === detailPayer) : []),
    [unsettledRows, detailPayer]
  )

  async function handleSave() {
    const v = validateExpenseInput(form.date, form.description, form.amount, form.payer)
    if (!v.ok) { setError(v.error); return }

    setSaving(true); setError(null)
    try {
      const result = await insertExpense({
        ...v.payload,
        note: form.note.trim() || null,
      })
      if (result.error) throw new Error(result.error)
      if (result.data) {
        setRows(prev => sortRows([result.data!, ...prev]))
        setForm(f => ({ ...f, description: '', amount: '', payer: '', note: '' }))
      }
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  function startEdit(row: Expense) {
    if (row.is_settled || editingId === row.id) return
    setEditingId(row.id)
    setEditForm({ date: row.date, description: row.description, amount: String(row.amount), note: row.note ?? '' })
  }

  async function handleUpdate() {
    if (!editingId) return
    const v = validateExpenseEdit(editForm.date, editForm.description, editForm.amount)
    if (!v.ok) { setError(v.error); return }

    setError(null)
    try {
      const result = await updateExpense(editingId, {
        ...v.payload,
        note: editForm.note.trim() || null,
      })
      if (result.error) throw new Error(result.error)
      if (result.data) {
        setRows(prev => sortRows(prev.map(r => r.id === editingId ? result.data! : r)))
        setEditingId(null)
      }
    } catch (e) {
      setError(toMessage(e))
    }
  }

  async function handleToggle(row: Expense) {
    try {
      const result = await toggleSettled(row.id, !row.is_settled)
      if (result.error) throw new Error(result.error)
      if (result.data) {
        setRows(prev => sortRows(prev.map(r => r.id === row.id ? result.data! : r)))
        if (row.id === editingId) setEditingId(null)
      }
    } catch (e) {
      setError(toMessage(e))
    }
  }

  async function handlePayerChange(row: Expense, payer: ExpensePayer | null) {
    try {
      const result = await updatePayer(row.id, payer)
      if (result.error) throw new Error(result.error)
      if (result.data) {
        setRows(prev => prev.map(r => r.id === row.id ? result.data! : r))
      }
    } catch (e) {
      setError(toMessage(e))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 비용 항목을 삭제하시겠습니까?')) return
    try {
      const result = await deleteExpense(id)
      if (result.error) throw new Error(result.error)
      setRows(prev => prev.filter(r => r.id !== id))
      if (id === editingId) setEditingId(null)
    } catch (e) {
      setError(toMessage(e))
    }
  }

  return {
    rows, form, setForm, saving, error,
    unsettledTotal, settlement, transfers, unassignedTotal,
    detailPayer, setDetailPayer, detailRows,
    editingId, editForm, setEditForm, startEdit, handleUpdate,
    handleSave, handleToggle, handlePayerChange, handleDelete,
  }
}
