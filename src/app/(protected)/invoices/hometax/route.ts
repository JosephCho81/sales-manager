import { getSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchCompanies } from '@/lib/companies'
import { planHometaxExport, hometaxSheetRows } from '@/lib/hometax'
import { buildHometaxWorkbook } from '@/lib/hometax-xlsx'
import type { InvoiceRow } from '@/lib/invoice-generator'

const YM_RE = /^\d{4}-\d{2}$/

/**
 * 홈택스 엑셀 일괄발급 파일 다운로드 (GET ?month=YYYY-MM&issuer=회사명&ids=id1,id2).
 * 읽기 전용이라 viewer도 받을 수 있다 — 발급은 홈택스에서 그 회사 인증서로 한다.
 * 클라이언트 미리보기를 믿지 않고 DB에서 다시 조회·검증한다.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return new Response('로그인이 필요합니다.', { status: 401 })

  const url = new URL(req.url)
  const month = url.searchParams.get('month') ?? ''
  const issuer = url.searchParams.get('issuer') ?? ''
  const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
  if (!YM_RE.test(month) || !issuer || ids.length === 0) return new Response('월·발행 회사·선택한 계산서가 올바르지 않습니다.', { status: 400 })

  const supabase = createAdminClient()
  const [iRes, pRes, companies] = await Promise.all([
    supabase.from('invoice_instructions').select('*').eq('year_month', month).eq('to_company', issuer),
    supabase.from('products').select('id, name, display_name'),
    fetchCompanies(),
  ])
  if (iRes.error) return new Response(`계산서 조회 실패: ${iRes.error.message}`, { status: 500 })
  if (pRes.error) return new Response(`품목 조회 실패: ${pRes.error.message}`, { status: 500 })

  const productNames = new Map((pRes.data ?? []).map(p => [p.id as string, (p.display_name ?? p.name) as string]))
  const plan = planHometaxExport({
    invoices: (iRes.data ?? []) as unknown as InvoiceRow[],
    issuer, companies, productNames, invoiceIds: new Set(ids),
  })
  if (plan.errors.length > 0) {
    return new Response(plan.errors.join('\n'), { status: 422, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  const buf = await buildHometaxWorkbook(hometaxSheetRows(plan.rows))
  const filename = `홈택스_일괄발급_${issuer.replace(/[()]/g, '')}_${month}.xlsx`
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}
