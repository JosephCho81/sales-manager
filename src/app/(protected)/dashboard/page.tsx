import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { fmtKrw, fmtNum } from '@/lib/margin'
import { computeDashboardTotals } from './dashboard-compute'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const now = new Date()
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deliveries: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let unpaidInvoices: any[] = []
  try {
    const supabase = createAdminClient()
    const [dResult, iResult] = await Promise.all([
      supabase
        .from('deliveries')
        .select(`
          id, quantity_kg, addl_quantity_kg, addl_margin_per_ton, depreciation_amount,
          product:products(id, display_name, buyer, price_unit),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .eq('invoice_month', yearMonth)
        .order('created_at', { ascending: false }),
      supabase
        .from('invoice_instructions')
        .select('id, year_month, from_company, to_company, total_amount, payment_due_date, invoice_type')
        .eq('is_paid', false)
        .order('payment_due_date', { ascending: true })
        .limit(50),
    ])
    deliveries = dResult.data ?? []
    unpaidInvoices = iResult.data ?? []
  } catch { deliveries = []; unpaidInvoices = [] }

  // ── 집계 ──────────────────────────────────────
  const { totalSell, totalMargin, totalGm, totalRs, byBuyer } =
    computeDashboardTotals(deliveries)

  const totalUnpaid = unpaidInvoices.reduce(
    (s: number, inv: { total_amount: number }) => s + Number(inv.total_amount), 0
  )
  const unpaidByMonth = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const inv of unpaidInvoices as any[]) {
    unpaidByMonth.set(inv.year_month, (unpaidByMonth.get(inv.year_month) ?? 0) + Number(inv.total_amount))
  }

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">대시보드</h2>
          <p className="text-sm text-gray-500 mt-0.5">{yearMonth} 계산서 발행 기준</p>
        </div>
        <Link href="/analytics" className="text-sm text-blue-600 hover:underline">
          월별/연도별 분석 →
        </Link>
      </div>

      {/* ── 이번달 요약 카드 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-gray-500 font-medium">이번달 총 매출</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{fmtKrw(totalSell)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{deliveries.length}건 입고 기준</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 font-medium">이번달 총 마진</p>
          <p className="text-xl font-bold text-green-600 mt-1">{fmtKrw(totalMargin)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {totalSell > 0 ? `마진율 ${fmtNum((totalMargin / totalSell) * 100, 1)}%` : '—'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 font-medium">금화 배분</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{fmtKrw(totalGm)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 font-medium">라성 배분</p>
          <p className="text-xl font-bold text-orange-600 mt-1">{fmtKrw(totalRs)}</p>
        </div>
      </div>

      {/* ── 거래처별 매출/마진 ── */}
      {byBuyer.size > 0 && (
        <div className="card overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">거래처별 현황</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {Array.from(byBuyer.entries()).map(([buyer, { sell, margin }]) => (
              <div key={buyer} className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{buyer}</span>
                <div className="flex gap-6 text-sm">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">매출</p>
                    <p className="font-semibold text-blue-600">{fmtKrw(sell)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">마진</p>
                    <p className="font-semibold text-green-600">{fmtKrw(margin)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 미지급 계산서 잔액 ── */}
      {unpaidInvoices.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">미지급 계산서 잔액</h3>
              <p className="text-xs text-gray-500 mt-0.5">지급 완료 미처리 항목</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-red-600">{fmtKrw(totalUnpaid)}</p>
              <p className="text-xs text-gray-400">{unpaidInvoices.length}건</p>
            </div>
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-3">
            {Array.from(unpaidByMonth.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([ym, amt]) => (
                <Link
                  key={ym}
                  href={`/invoices?month=${ym}`}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-100 rounded-md hover:bg-red-100 transition-colors"
                >
                  <span className="text-xs font-medium text-gray-700">{ym}</span>
                  <span className="text-sm font-bold text-red-600">{fmtKrw(amt)}</span>
                </Link>
              ))}
          </div>
        </div>
      )}

      {deliveries.length === 0 && unpaidInvoices.length === 0 && (
        <div className="card px-4 py-12 text-center text-sm text-gray-400">
          {yearMonth} 계산서 발행 예정 입고 데이터가 없습니다.
        </div>
      )}
    </div>
  )
}
