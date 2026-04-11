'use server'

import { createAdminClient } from '@/lib/supabase/server'

export async function insertCommission(payload: {
  year_month: string
  company: '동국제강' | '현대제철'
  quantity_kg: number
  price_per_ton: number
  commission_amount: number
  memo: string | null
}) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('commissions')
    .insert(payload)
    .select('*')
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function deleteCommission(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('commissions').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}
