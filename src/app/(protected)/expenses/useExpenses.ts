'use client'

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react'
import { toMessage } from '@/lib/error'
import { insertExpense, toggleSettled, updatePayer, deleteExpense } from './actions'
import { EXPENSE_PAYERS, type Expense, type ExpensePayer } from '@/types'

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

type ExpensesForm = { date: string; description: string; amount: string; payer: '' | ExpensePayer; note: string }

export interface PayerSettlement {
  share: number
  paid: number
  /** share - paid: 양수면 더 내야 할 금액, 음수면 돌려받을 금액 */
  net: number
}

export interface Transfer {
  from: ExpensePayer
  to: ExpensePayer
  amount: number
}

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

  const unsettledRows = useMemo(() => rows.filter(r => !r.is_settled), [rows])

  const unsettledTotal = useMemo(
    () => unsettledRows.reduce((s, r) => s + r.amount, 0),
    [unsettledRows]
  )

  const settlement = useMemo(() => {
    const share = splitExpense(unsettledTotal)
    const paid: Record<ExpensePayer, number> = { korea_a1: 0, raseong: 0, geumhwa: 0 }
    for (const r of unsettledRows) {
      if (r.payer) paid[r.payer] += r.amount
    }
    return Object.fromEntries(
      EXPENSE_PAYERS.map(p => [p, { share: share[p], paid: paid[p], net: share[p] - paid[p] }])
    ) as Record<ExpensePayer, PayerSettlement>
  }, [unsettledTotal, unsettledRows])

  const unassignedTotal = useMemo(
    () => unsettledRows.filter(r => !r.payer).reduce((s, r) => s + r.amount, 0),
    [unsettledRows]
  )

  // 낼 금액(net>0) 업체가 받을 금액(net<0) 업체에게 송금 — 그리디 매칭.
  // 지불 업체 미지정분만큼 낼 금액 합이 받을 금액 합보다 클 수 있으며, 그 잔여분은 송금 대상이 없어 제외된다.
  const transfers = useMemo(() => {
    const debtors = EXPENSE_PAYERS
      .filter(p => settlement[p].net > 0)
      .map(p => ({ p, amt: settlement[p].net }))
    const creditors = EXPENSE_PAYERS
      .filter(p => settlement[p].net < 0)
      .map(p => ({ p, amt: -settlement[p].net }))
    const result: Transfer[] = []
    let i = 0, j = 0
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].amt, creditors[j].amt)
      if (amount > 0) result.push({ from: debtors[i].p, to: creditors[j].p, amount })
      debtors[i].amt -= amount
      creditors[j].amt -= amount
      if (debtors[i].amt === 0) i++
      if (creditors[j].amt === 0) j++
    }
    return result
  }, [settlement])

  const detailRows = useMemo(
    () => (detailPayer ? unsettledRows.filter(r => r.payer === detailPayer) : []),
    [unsettledRows, detailPayer]
  )

  async function handleSave() {
    if (!form.date) { setError('날짜를 입력하세요.'); return }
    if (!form.description.trim()) { setError('내역을 입력하세요.'); return }
    const amount = parseInt(form.amount, 10)
    if (!amount || amount <= 0) { setError('금액을 올바르게 입력하세요.'); return }
    if (!form.payer) { setError('지불 업체를 선택하세요.'); return }

    setSaving(true); setError(null)
    try {
      const result = await insertExpense({
        date: form.date,
        description: form.description.trim(),
        amount,
        note: form.note.trim() || null,
        payer: form.payer,
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
    } catch (e) {
      setError(toMessage(e))
    }
  }

  return {
    rows, form, setForm, saving, error,
    unsettledTotal, settlement, transfers, unassignedTotal,
    detailPayer, setDetailPayer, detailRows,
    handleSave, handleToggle, handlePayerChange, handleDelete,
  }
}
