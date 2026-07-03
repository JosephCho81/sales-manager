'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function upsertProduct(payload: Record<string, unknown>, editId?: string) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()

  if (editId) {
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', editId)
      .select()
      .single()
    if (error) return { error: error.message }
    await logAudit(auth.user, { table: 'products', rowId: editId, action: 'update', after: payload })
    return { data }
  } else {
    const { data, error } = await supabase
      .from('products')
      .insert(payload)
      .select()
      .single()
    if (error) return { error: error.message }
    await logAudit(auth.user, { table: 'products', rowId: (data as { id: string }).id, action: 'insert', after: payload })
    return { data }
  }
}

export async function toggleProductActive(id: string, isActive: boolean) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('products')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'products', rowId: id, action: 'update', after: { is_active: isActive } })
  return { success: true }
}
