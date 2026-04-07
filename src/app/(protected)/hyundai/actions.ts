'use server'

import { createAdminClient } from '@/lib/supabase/server'

export async function insertHyundaiTransaction(payload: Record<string, unknown>) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('hyundai_transactions')
    .insert(payload)
    .select('*')
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function deleteHyundaiTransaction(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('hyundai_transactions').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}
