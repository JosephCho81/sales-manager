'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { STALE_WRITE_ERROR, type EditTarget } from '@/lib/optimistic'
import { legacyDeliveryDepAllowed } from '@/lib/depreciation'
import {
  buildDeliveryRows, duplicateLines, invoiceMonthConflict,
  type ContractForDelivery, type DeliveryLineInput,
} from '@/lib/delivery-batch'

const DELIVERY_SELECT = `
  id, year_month, invoice_month, delivery_date, product_id, contract_id,
  quantity_kg, depreciation_amount,
  memo, created_at, updated_at,
  product:products(id, display_name, buyer),
  contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate, start_date, end_date)
`

const CONTRACT_FOR_DELIVERY = 'id, product_id, start_date, end_date, invoice_month_offset'

/** 같은 품목·납품월의 기존 입고(자기 자신 제외)와 청구월이 갈리는지 */
async function existingInvoiceMonthConflict(
  supabase: ReturnType<typeof createAdminClient>,
  productId: string, yearMonth: string, invoiceMonths: string[], excludeId?: string,
): Promise<string | null> {
  let q = supabase.from('deliveries').select('id, invoice_month')
    .eq('product_id', productId).eq('year_month', yearMonth)
  if (excludeId) q = q.neq('id', excludeId)
  const { data, error } = await q
  if (error) return error.message
  return invoiceMonthConflict([...invoiceMonths, ...(data ?? []).map(d => d.invoice_month as string)])
}

export type DuplicateDelivery = { id: string; contract_id: string; year_month: string; delivery_date: string | null; quantity_kg: number }

/**
 * 새 입고 — 같은 품목의 단가별 물량을 한 번에 저장한다.
 * 배열 insert는 한 SQL 문이라 일부만 저장되는 일이 없다.
 * 같은 품목·단가·납품월에 이미 입고가 있으면 confirmDuplicate 없이 저장하지 않는다.
 */
export async function createDeliveries(
  input: { deliveryDate: string; productId: string; lines: DeliveryLineInput[]; memo: string | null },
  confirmDuplicate = false,
): Promise<{ error?: string; duplicates?: DuplicateDelivery[]; data?: unknown[] }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data: contracts, error: cErr } = await supabase
    .from('contracts').select(CONTRACT_FOR_DELIVERY).eq('product_id', input.productId)
  if (cErr) return { error: cErr.message }

  const built = buildDeliveryRows({ ...input, contracts: (contracts ?? []) as ContractForDelivery[] })
  if (!built.ok) return { error: built.error }
  const rows = built.value

  const conflict = await existingInvoiceMonthConflict(
    supabase, input.productId, rows[0].year_month, rows.map(r => r.invoice_month))
  if (conflict) return { error: conflict }

  if (!confirmDuplicate) {
    const { data: existing, error: eErr } = await supabase
      .from('deliveries')
      .select('id, contract_id, year_month, delivery_date, quantity_kg')
      .eq('product_id', input.productId)
      .eq('year_month', rows[0].year_month)
    if (eErr) return { error: eErr.message }
    const dups = duplicateLines((existing ?? []) as DuplicateDelivery[], rows)
    if (dups.length > 0) return { duplicates: dups }
  }

  const { data, error } = await supabase.from('deliveries').insert(rows).select(DELIVERY_SELECT)
  if (error) return { error: error.message }
  for (const [i, d] of (data ?? []).entries()) {
    await logAudit(auth.user, { table: 'deliveries', rowId: (d as { id: string }).id, action: 'insert', after: rows[i] })
  }
  return { data: data ?? [] }
}

/** 입고 1건 수정. 납품월·청구월은 계약 정보로 서버가 다시 만든다 */
export async function updateDelivery(
  edit: EditTarget,
  input: { deliveryDate: string; contractId: string; tons: string; depreciationAmount: number | null; memo: string | null },
) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()

  const { data: cur, error: curErr } = await supabase
    .from('deliveries').select('depreciation_amount').eq('id', edit.id).maybeSingle()
  if (curErr) return { error: curErr.message }
  if (!cur) return { error: STALE_WRITE_ERROR }
  if (!legacyDeliveryDepAllowed(input.depreciationAmount, cur.depreciation_amount ?? null)) {
    return { error: '입고 건별 감가는 더 이상 받지 않습니다. 결제 일정의 감가 패널에서 입력하세요.' }
  }

  const { data: contract, error: cErr } = await supabase
    .from('contracts').select(CONTRACT_FOR_DELIVERY).eq('id', input.contractId).maybeSingle()
  if (cErr) return { error: cErr.message }
  if (!contract) return { error: '낙찰 단가를 찾을 수 없습니다. 새로고침 후 다시 시도하세요.' }

  const built = buildDeliveryRows({
    deliveryDate: input.deliveryDate,
    productId: contract.product_id,
    lines: [{ contractId: contract.id, tons: input.tons }],
    memo: input.memo,
    contracts: [contract as ContractForDelivery],
  })
  if (!built.ok) return { error: built.error }
  const payload = { ...built.value[0], depreciation_amount: input.depreciationAmount }

  const conflict = await existingInvoiceMonthConflict(
    supabase, payload.product_id, payload.year_month, [payload.invoice_month], edit.id)
  if (conflict) return { error: conflict }

  const { data, error } = await supabase
    .from('deliveries')
    .update(payload)
    .eq('id', edit.id)
    .eq('updated_at', edit.updatedAt)
    .select(DELIVERY_SELECT)
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: STALE_WRITE_ERROR }
  await logAudit(auth.user, { table: 'deliveries', rowId: edit.id, action: 'update', after: payload })
  return { data: data[0] }
}

export async function upsertFxRate(productId: string, blDate: string, rate: number) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { error } = await supabase.from('fx_rates').upsert(
    { product_id: productId, bl_date: blDate, rate_krw_per_usd: rate, memo: '입고 등록 시 입력' },
    { onConflict: 'product_id,bl_date' }
  )
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'fx_rates', rowId: `${productId}:${blDate}`, action: 'update', after: { product_id: productId, bl_date: blDate, rate_krw_per_usd: rate } })
  return { success: true }
}

export async function deleteDelivery(id: string) {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data: before } = await supabase.from('deliveries').select('*').eq('id', id).single()
  const { error } = await supabase.from('deliveries').delete().eq('id', id)
  if (error) return { error: error.message }
  await logAudit(auth.user, { table: 'deliveries', rowId: id, action: 'delete', before })
  return { success: true }
}
