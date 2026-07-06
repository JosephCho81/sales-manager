import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import FetchErrorView from '@/components/FetchErrorView'
import InvoicesClient from './InvoicesClient'
import { fetchInvoiceInputs } from './invoice-data'
import { type InvoiceRow } from '@/lib/invoice-generator'
import type { MonthlyDepreciation } from '@/types'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ month?: string }>

function currentYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const params    = await searchParams
  const yearMonth = params.month ?? currentYM()

  try {
    const supabase = createAdminClient()

    const [inputs, iRes, pRes, mdRes] = await Promise.all([
      // 입고·환율·커미션 — 재생성 액션과 동일한 조회 경로 공유
      fetchInvoiceInputs(yearMonth),

      // 계산서 발행 지시
      supabase
        .from('invoice_instructions')
        .select('*')
        .eq('year_month', yearMonth)
        .order('created_at', { ascending: true }),

      // 품목 전체 목록 (product_id → display_name 매핑용)
      supabase
        .from('products')
        .select('id, name, display_name'),

      // 월별 감가 (분탄 동창 미지급) — 전체 이력 (테이블 소형)
      supabase
        .from('monthly_depreciations')
        .select('*')
        .order('year_month', { ascending: true }),
    ])

    if (iRes.error)  throw new Error(`계산서 조회 실패: ${iRes.error.message}`)
    if (pRes.error)  throw new Error(`품목 조회 실패: ${pRes.error.message}`)
    if (mdRes.error) throw new Error(`월별 감가 조회 실패: ${mdRes.error.message}`)

    return (
      <InvoicesClient
        key={yearMonth}
        yearMonth={yearMonth}
        initialDeliveries={inputs.deliveries}
        initialInvoices={(iRes.data ?? []) as unknown as InvoiceRow[]}
        initialCommissions={inputs.commissions}
        products={(pRes.data ?? []) as Array<{ id: string; name: string; display_name: string | null }>}
        initialMonthlyDeps={(mdRes.data ?? []) as unknown as MonthlyDepreciation[]}
      />
    )
  } catch (e) {
    return <FetchErrorView message={toMessage(e)} />
  }
}
