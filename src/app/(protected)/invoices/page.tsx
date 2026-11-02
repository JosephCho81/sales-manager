import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import FetchErrorView from '@/components/FetchErrorView'
import InvoicesClient from './InvoicesClient'
import { fetchInvoiceInputs } from './invoice-data'
import { hydrateHolidays, uncoveredHolidayYears } from '@/lib/holidays'
import { fetchCompanies } from '@/lib/companies'
import { getSession } from '@/lib/auth'
import { hometaxIssuerLockFor } from '@/lib/account'
import {
  type InvoiceRow, type InvoiceDrift,
  diffInvoices, generateInvoices, generateCommissionInvoices, mapDeliveries,
} from '@/lib/invoice-generator'
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

    // 지급일 계산에 쓰이는 공휴일을 DB 값으로 맞춘 뒤에 미등록 연도를 판정한다
    await hydrateHolidays()
    const uncoveredYears = uncoveredHolidayYears(yearMonth)

    const [inputs, iRes, pRes, mdRes, companiesRes] = await Promise.all([
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

      // 거래처 사업자정보 — 홈택스 엑셀 전용. 025 미적용이어도 지급일정은 떠야 하므로 실패를 삼키고 대화상자에서 알린다
      fetchCompanies().then(
        companies => ({ companies, error: null }),
        (e: unknown) => ({ companies: [], error: toMessage(e) }),
      ),
    ])

    const session = await getSession()

    if (iRes.error)  throw new Error(`계산서 조회 실패: ${iRes.error.message}`)
    if (pRes.error)  throw new Error(`품목 조회 실패: ${pRes.error.message}`)
    if (mdRes.error) throw new Error(`월별 감가 조회 실패: ${mdRes.error.message}`)

    const storedInvoices = (iRes.data ?? []) as unknown as InvoiceRow[]
    const productList = (pRes.data ?? []) as Array<{ id: string; name: string; display_name: string | null }>
    const drift = computeDrift(inputs, yearMonth, storedInvoices, productList)
    // 계산서는 재생성 때 전부 새로 insert되므로 가장 이른 created_at = 마지막 생성 시각
    const generatedAt = storedInvoices.reduce<string | null>(
      (m, r) => (r.created_at && (!m || r.created_at < m) ? r.created_at : m), null)
    // 생성 뒤 입력이 바뀐 품목 (커미션 계산서 = null)
    const changedAfterGen = Array.from(new Set(
      inputs.inputChanges
        .filter(c => generatedAt && new Date(c.at) > new Date(generatedAt))
        .map(c => c.product_id),
    ))

    return (
      <InvoicesClient
        key={yearMonth}
        yearMonth={yearMonth}
        initialDeliveries={inputs.deliveries}
        initialInvoices={storedInvoices}
        drift={drift}
        changedAfterGen={changedAfterGen}
        initialCommissions={inputs.commissions}
        products={productList}
        initialMonthlyDeps={(mdRes.data ?? []) as unknown as MonthlyDepreciation[]}
        uncoveredHolidayYears={uncoveredYears}
        companies={companiesRes.companies}
        companiesError={companiesRes.error}
        hometaxIssuerLock={session ? hometaxIssuerLockFor(session.username) : null}
      />
    )
  } catch (e) {
    return <FetchErrorView message={toMessage(e)} />
  }
}

/**
 * 저장된 계산서가 현재 입력(입고·감가·커미션)과 어긋나는지 — 재생성 액션과 같은 생성 경로로
 * 메모리에서만 만들어 본다. 생성이 실패하면(환율 누락 등) 판정하지 않는다(null):
 * 재생성 버튼이 그 오류를 그대로 보여준다.
 */
function computeDrift(
  inputs: Awaited<ReturnType<typeof fetchInvoiceInputs>>,
  yearMonth: string,
  stored: InvoiceRow[],
  products: Array<{ id: string; name: string; display_name: string | null }>,
): InvoiceDrift[] | null {
  try {
    const mapped = mapDeliveries(inputs.deliveries, inputs.fxRates)
    if (mapped.length === 0 && inputs.commissions.length === 0) return null
    const generated = [
      ...generateInvoices(mapped, yearMonth, inputs.monthlyDeps),
      ...generateCommissionInvoices(inputs.commissions, yearMonth),
    ]
    const nameOf = new Map(products.map(p => [p.id, p.display_name ?? p.name]))
    const TYPE = { sales: '매출', cost: '매입', commission: '커미션' } as Record<string, string>
    return diffInvoices(generated, stored, r =>
      `${r.product_id ? nameOf.get(r.product_id) ?? '' : '커미션'} ${r.from_company}→${r.to_company} ${TYPE[r.invoice_type ?? ''] ?? ''}`.trim(),
    )
  } catch {
    return null
  }
}
