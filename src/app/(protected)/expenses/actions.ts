'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import type { Expense, ExpensePayer } from '@/types'

export async function insertExpense(payload: {
  date: string
  description: string
  amount: number
  note: string | null
  payer: ExpensePayer
}) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('expenses')
    .insert(payload)
    .select('*')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/expenses')
  return { data: data as Expense }
}

export async function toggleSettled(id: string, isSettled: boolean) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('expenses')
    .update({ is_settled: isSettled })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/expenses')
  return { data: data as Expense }
}

export async function updatePayer(id: string, payer: ExpensePayer | null) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('expenses')
    .update({ payer })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/expenses')
  return { data: data as Expense }
}

export async function deleteExpense(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/expenses')
  return { success: true }
}
