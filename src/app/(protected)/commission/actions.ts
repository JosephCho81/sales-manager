'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function insertCommission(payload: {
  year_month: string
  company: '동국제강' | '현대제철'
  quantity_kg: number
  price_per_ton: number
  commission_amount: number
  memo: string | null
}) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('commissions')
    .insert(payload)
    .select('*')
    .single()
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'commissions', rowId: (data as { id: string }).id, action: 'insert', after: payload })
  return { data }
}

export async function deleteCommission(id: string) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data: before } = await supabase.from('commissions').select('*').eq('id', id).single()
  const { error } = await supabase.from('commissions').delete().eq('id', id)
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'commissions', rowId: id, action: 'delete', before })
  return { success: true }
}
