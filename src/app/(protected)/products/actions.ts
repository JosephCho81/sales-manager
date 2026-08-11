'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { STALE_WRITE_ERROR, type EditTarget } from '@/lib/optimistic'

export async function upsertProduct(payload: Record<string, unknown>, edit?: EditTarget) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()

  if (edit) {
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', edit.id)
      .eq('updated_at', edit.updatedAt)
      .select()
    if (error) return { error: error.message }
    if (!data || data.length === 0) return { error: STALE_WRITE_ERROR }
    await logAudit(auth.user, { table: 'products', rowId: edit.id, action: 'update', after: payload })
    return { data: data[0] }
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
