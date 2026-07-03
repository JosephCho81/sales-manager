'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function upsertContract(payload: Record<string, unknown>, editId?: string) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

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
    await logAudit(auth.user, { table: 'contracts', rowId: editId, action: 'update', after: payload })
    return { data }
  } else {
    const { data, error } = await supabase
      .from('contracts')
      .insert(payload)
      .select(SELECT)
      .single()
    if (error) return { error: error.message }
    await logAudit(auth.user, { table: 'contracts', rowId: (data as { id: string }).id, action: 'insert', after: payload })
    return { data }
  }
}

export async function reviseContract(payload: {
  original_id: string
  effective_date: string
  sell_price: number
  cost_price: number
  reference_exchange_rate: number | null
  reason: string
}) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const SELECT = '*, product:products(id, name, display_name, price_unit)'

  const { data: rpcRows, error: rpcError } = await supabase.rpc('revise_contract', {
    p_original_id: payload.original_id,
    p_effective_date: payload.effective_date,
    p_sell_price: payload.sell_price,
    p_cost_price: payload.cost_price,
    p_ref_rate: payload.reference_exchange_rate,
    p_reason: payload.reason,
  })
  if (rpcError) return { error: rpcError.message }

  const newId = (rpcRows as { id: string }[] | null)?.[0]?.id
  if (!newId) return { error: '개정 행 생성 결과를 읽지 못했습니다.' }

  await logAudit(auth.user, { table: 'contracts', rowId: payload.original_id, action: 'update', after: { revised_to: newId, ...payload } })

  // 잘린 원본 + 새 행을 join 형태로 함께 조회
  const { data, error } = await supabase
    .from('contracts')
    .select(SELECT)
    .in('id', [payload.original_id, newId])
  if (error) return { error: error.message }

  const rows = (data ?? []) as unknown as Array<{ id: string }>
  return {
    data: {
      newRow: rows.find(r => r.id === newId),
      originalRow: rows.find(r => r.id === payload.original_id),
    },
  }
}

export async function deleteContract(id: string) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data: before } = await supabase.from('contracts').select('*').eq('id', id).single()
  const { error } = await supabase.from('contracts').delete().eq('id', id)
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'contracts', rowId: id, action: 'delete', before })
  return { success: true }
}
