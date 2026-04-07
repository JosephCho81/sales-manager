'use server'

import { createAdminClient } from '@/lib/supabase/server'

export async function upsertContract(payload: Record<string, unknown>, editId?: string) {
  const supabase = createAdminClient()
  const SELECT = '*, product:products(id, name, display_name, price_unit)'

  if (editId) {
    const { data, error } = await supabase
      .from('contracts')
      .update(payload)
      .eq('id', editId)
      .select(SELECT)
      .single()
    if (error) return { error: error.message }
    return { data }
  } else {
    const { data, error } = await supabase
      .from('contracts')
      .insert(payload)
      .select(SELECT)
      .single()
    if (error) return { error: error.message }
    return { data }
  }
}

export async function deleteContract(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('contracts').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}
