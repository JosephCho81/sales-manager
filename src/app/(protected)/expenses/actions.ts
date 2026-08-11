'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { STALE_WRITE_ERROR, type EditTarget } from '@/lib/optimistic'
import type { Expense, ExpensePayer } from '@/types'

export async function insertExpense(payload: {
  date: string
  description: string
  amount: number
  note: string | null
  payer: ExpensePayer
}) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('expenses')
    .insert(payload)
    .select('*')
    .single()
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'expenses', rowId: data.id, action: 'insert', after: data })
  revalidatePath('/expenses')
  return { data: data as Expense }
}

export async function toggleSettled(id: string, isSettled: boolean) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('expenses')
    .update({ is_settled: isSettled })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'expenses', rowId: id, action: 'update', after: data })
  revalidatePath('/expenses')
  return { data: data as Expense }
}

export async function updateExpense(edit: EditTarget, payload: {
  date: string
  description: string
  amount: number
  note: string | null
}) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('expenses')
    .update(payload)
    .eq('id', edit.id)
    .eq('updated_at', edit.updatedAt)
    .select('*')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: STALE_WRITE_ERROR }
  await logAudit(auth.user, { table: 'expenses', rowId: edit.id, action: 'update', after: data[0] })
  revalidatePath('/expenses')
  return { data: data[0] as Expense }
}

export async function updatePayer(id: string, payer: ExpensePayer | null) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('expenses')
    .update({ payer })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'expenses', rowId: id, action: 'update', after: data })
  revalidatePath('/expenses')
  return { data: data as Expense }
}

export async function deleteExpense(id: string) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data: before } = await supabase.from('expenses').select('*').eq('id', id).single()
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'expenses', rowId: id, action: 'delete', before })
  revalidatePath('/expenses')
  return { success: true }
}
