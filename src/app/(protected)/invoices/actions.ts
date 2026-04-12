'use server'

import { createAdminClient } from '@/lib/supabase/server'
import type { InvoiceToCreate } from '@/lib/invoice-generator'

export async function replaceInvoices(yearMonth: string, rows: InvoiceToCreate[]) {
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

export async function updatePaidDate(id: string, paidDate: string | null) {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('invoice_instructions')
    .update({ is_paid: paidDate !== null, paid_at: paidDate })
    .eq('id', id)
  if (error) return { error: error.message }

  return { success: true }
}
