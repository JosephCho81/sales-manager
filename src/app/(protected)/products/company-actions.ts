'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { HOMETAX_COMPANY_NAMES, companyErrors, type CompanyInfo } from '@/lib/hometax'

/**
 * 거래처 사업자정보 저장 (홈택스 엑셀용). 계산서에 그대로 찍히는 값이라
 * 사업자번호 검증번호를 코드로 확인한다 — 틀린 번호로 발급되면 수정발급해야 한다.
 */
export async function saveCompany(input: CompanyInfo): Promise<{ error?: string; success?: true }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  if (!HOMETAX_COMPANY_NAMES.includes(input.name)) return { error: '등록 대상 회사가 아닙니다.' }
  const row: CompanyInfo = {
    name: input.name,
    biz_no: input.biz_no.replace(/\D/g, ''),
    trade_name: input.trade_name.trim(),
    ceo_name: input.ceo_name.trim(),
    address: input.address.trim(),
    biz_type: input.biz_type.trim(),
    biz_item: input.biz_item.trim(),
    email: input.email.trim(),
  }
  const errs = companyErrors(row, '거래처', row.name)
  if (errs.length > 0) return { error: errs.join(' ') }

  const supabase = createAdminClient()
  const { data: before } = await supabase.from('companies').select('*').eq('name', row.name).maybeSingle()
  const { error } = await supabase
    .from('companies')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'name' })
  if (error) return { error: error.message }
  await logAudit(auth.user, {
    table: 'companies', rowId: row.name, action: before ? 'update' : 'insert', before: before ?? undefined, after: row,
  })
  return { success: true }
}
