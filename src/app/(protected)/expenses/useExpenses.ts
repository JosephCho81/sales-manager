'use client'

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react'
import { toMessage } from '@/lib/error'
import { insertExpense, toggleSettled, deleteExpense } from './actions'
import type { Expense } from '@/types'

function splitExpense(total: number) {
  const base = Math.floor(total / 3)
  return { korea_a1: base, raseong: base, geumhwa: total - base * 2 }
}

function sortRows(rows: Expense[]): Expense[] {
  return [...rows].sort((a, b) => {
    if (a.is_settled !== b.is_settled) return a.is_settled ? 1 : -1
    return b.date.localeCompare(a.date)
  })
}

type ExpensesForm = { date: string; description: string; amount: string; note: string }

interface ExpensesReturn {
  rows: Expense[]
  form: ExpensesForm
  setForm: Dispatch<SetStateAction<ExpensesForm>>
  saving: boolean
  error: string | null
  unsettledTotal: number
  split: { korea_a1: number; raseong: number; geumhwa: number }
  handleSave: () => Promise<void>
  handleToggle: (row: Expense) => Promise<void>
  handleDelete: (id: string) => Promise<void>
}

export function useExpenses(initialRows: Expense[]): ExpensesReturn {
  const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD
  const [rows, setRows] = useState<Expense[]>(initialRows)
  const [form, setForm] = useState({ date: today, description: '', amount: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const unsettledTotal = useMemo(
    () => rows.filter(r => !r.is_settled).reduce((s, r) => s + r.amount, 0),
    [rows]
  )

  const split = useMemo(() => splitExpense(unsettledTotal), [unsettledTotal])

  async function handleSave() {
    if (!form.date) { setError('날짜를 입력하세요.'); return }
    if (!form.description.trim()) { setError('내역을 입력하세요.'); return }
    const amount = parseInt(form.amount, 10)
    if (!amount || amount <= 0) { setError('금액을 올바르게 입력하세요.'); return }

    setSaving(true); setError(null)
    try {
      const result = await insertExpense({
        date: form.date,
        description: form.description.trim(),
        amount,
        note: form.note.trim() || null,
      })
      if (result.error) throw new Error(result.error)
      if (result.data) {
        setRows(prev => sortRows([result.data!, ...prev]))
        setForm(f => ({ ...f, description: '', amount: '', note: '' }))
      }
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(row: Expense) {
    try {
      const result = await toggleSettled(row.id, !row.is_settled)
      if (result.error) throw new Error(result.error)
      if (result.data) {
        setRows(prev => sortRows(prev.map(r => r.id === row.id ? result.data! : r)))
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
    } catch (e) {
      setError(toMessage(e))
    }
  }

  return { rows, form, setForm, saving, error, unsettledTotal, split, handleSave, handleToggle, handleDelete }
}
