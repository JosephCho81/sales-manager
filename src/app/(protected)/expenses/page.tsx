import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import FetchErrorView from '@/components/FetchErrorView'
import ExpensesClient from './ExpensesClient'
import type { Expense } from '@/types'

export const dynamic = 'force-dynamic'

export default async function ExpensesPage() {
  let rows: Expense[] = []
  let fetchError: string | null = null

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('is_settled', { ascending: true })
      .order('date', { ascending: false })
    if (error) fetchError = error.message
    else rows = (data ?? []) as Expense[]
  } catch (e) {
    fetchError = toMessage(e)
  }

  if (fetchError) return <FetchErrorView message={fetchError} />

  return <ExpensesClient initialRows={rows} />
}
