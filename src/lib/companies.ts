import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { CompanyInfo } from '@/lib/hometax'

/** `companies` 전체 (025). 몇 행뿐이라 전체 조회 */
export async function fetchCompanies(): Promise<CompanyInfo[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('companies')
    .select('name, biz_no, trade_name, ceo_name, address, biz_type, biz_item, email')
  if (error) throw new Error(`거래처 사업자정보 조회 실패: ${error.message} (마이그레이션 025 적용 여부 확인)`)
  return (data ?? []) as CompanyInfo[]
}
