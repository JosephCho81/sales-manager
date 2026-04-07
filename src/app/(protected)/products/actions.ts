'use server'

import { createAdminClient } from '@/lib/supabase/server'

export async function upsertProduct(payload: Record<string, unknown>, editId?: string) {
  const supabase = createAdminClient()

  if (editId) {
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', editId)
      .select()
      .single()
    if (error) return { error: error.message }
    return { data }
  } else {
    const { data, error } = await supabase
      .from('products')
      .insert(payload)
      .select()
      .single()
    if (error) return { error: error.message }
    return { data }
  }
}

export async function toggleProductActive(id: string, isActive: boolean) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('products')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}
