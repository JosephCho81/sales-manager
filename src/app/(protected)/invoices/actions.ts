'use server'

import { createAdminClient } from '@/lib/supabase/server'

export async function replaceInvoices(yearMonth: string, rows: Record<string, unknown>[]) {
  const supabase = createAdminClient()
  const { error: delErr } = await supabase
    .from('invoice_instructions')
    .delete()
    .eq('year_month', yearMonth)
  if (delErr) return { error: delErr.message }

  const { data, error: insErr } = await supabase
    .from('invoice_instructions')
    .insert(rows)
    .select('*')
  if (insErr) return { error: insErr.message }
  return { data }
}

export async function deleteAllInvoices(yearMonth: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('invoice_instructions')
    .delete()
    .eq('year_month', yearMonth)
  if (error) return { error: error.message }
  return { success: true }
}

export async function toggleInvoicePaid(id: string, isPaid: boolean, paidAt: string | null) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('invoice_instructions')
    .update({ is_paid: isPaid, paid_at: paidAt })
    .eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}
