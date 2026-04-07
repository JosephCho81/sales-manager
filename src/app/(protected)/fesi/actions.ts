'use server'

import { createAdminClient } from '@/lib/supabase/server'

export async function upsertFxRate(payload: {
  product_id: string
  bl_date: string
  rate_krw_per_usd: number
  memo: string | null
}) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('fx_rates')
    .upsert(payload, { onConflict: 'product_id,bl_date' })
    .select('*')
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function deleteFxRate(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('fx_rates').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}
