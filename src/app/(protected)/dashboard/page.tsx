import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { calcMarginFromContract, calcAddlMargin, fmtKrw, fmtNum } from '@/lib/margin'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const now = new Date()
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  let rows: unknown[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let unpaidInvoices: any[] = []
  try {
    const supabase = createAdminClient()
    const [dResult, iResult] = await Promise.all([
      supabase
        .from('deliveries')
        .select(`
          id, year_month, quantity_kg, addl_quantity_kg, addl_margin_per_ton,
          product:products(id, display_name, buyer),
          contract:contracts(id, sell_price, cost_price, currency, reference_exchange_rate)
        `)
        .eq('year_month', yearMonth)
        .order('created_at', { ascending: false }),
      supabase
        .from('invoice_instructions')
        .select('id, year_month, from_company, to_company, total_amount, payment_due_date, invoice_type')
        .eq('is_paid', false)
        .order('payment_due_date', { ascending: true })
        .limit(50),
    ])
    rows = dResult.data ?? []
    unpaidInvoices = iResult.data ?? []
  } catch { rows = []; unpaidInvoices = [] }

  // 합산
  let totalMargin = 0, totalA1 = 0, totalGm = 0, totalRs = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of rows as any[]) {
    if (!d.contract) continue
    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    totalMargin += m.total_margin; totalA1 += m.korea_a1; totalGm += m.geumhwa; totalRs += m.raseong
    if (d.addl_quantity_kg && d.addl_margin_per_ton) {
      const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
      totalMargin += am.total_margin; totalA1 += am.korea_a1; totalGm += am.geumhwa; totalRs += am.raseong
    }
  }

  const summaryCards = [
    { label: '이번 달 총 마진', value: fmtKrw(totalMargin), color: 'text-blue-600' },
    { label: '한국에이원 배분', value: fmtKrw(totalA1),     color: 'text-green-600' },
    { label: '금화 배분',       value: fmtKrw(totalGm),     color: 'text-purple-600' },
    { label: '라성 배분',       value: fmtKrw(totalRs),     color: 'text-orange-600' },
  ]

  const totalUnpaid = unpaidInvoices.reduce((s: number, inv: { total_amount: number }) => s + Number(inv.total_amount), 0)
  const unpaidByMonth = new Map<string, number>()
  for (const inv of unpaidInvoices) {
    unpaidByMonth.set(inv.year_month, (unpaidByMonth.get(inv.year_month) ?? 0) + Number(inv.total_amount))
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">대시보드</h2>
        <p className="text-sm text-gray-500 mt-0.5">{yearMonth} 기준</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {summaryCards.map(c => (
          <div key={c.label} className="card p-4">
            <p className="text-xs text-gray-500 font-medium">{c.label}</p>
            <p className={`text-xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 미지급 잔액 요약 */}
      {unpaidInvoices.length > 0 && (
        <div className="card overflow-hidden mb-6">
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

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">이번 달 입고 현황</h3>
          <span className="text-xs text-gray-500">총 {(rows as unknown[]).length}건</span>
        </div>
        {(rows as unknown[]).length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            이번 달 입고 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">품목</th>
                  <th className="table-th">납품처</th>
                  <th className="table-th text-right">물량 (톤)</th>
                  <th className="table-th text-right">총 마진</th>
                  <th className="table-th text-right">한국에이원</th>
                  <th className="table-th text-right">금화</th>
                  <th className="table-th text-right">라성</th>
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(rows as any[]).map((d: any) => {
                  if (!d.contract) return null
                  const m = calcMarginFromContract(d.contract, d.quantity_kg)
                  const addl = d.addl_quantity_kg && d.addl_margin_per_ton
                    ? calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
                    : null
                  const ct = m.total_margin + (addl?.total_margin ?? 0)
                  const b = Math.floor(ct / 3)
                  return (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="table-td font-medium">{d.product?.display_name}</td>
                      <td className="table-td text-gray-500">{d.product?.buyer}</td>
                      <td className="table-td text-right">{fmtNum(d.quantity_kg / 1000, 3)}</td>
                      <td className="table-td text-right font-semibold text-blue-600">{fmtKrw(ct)}</td>
                      <td className="table-td text-right text-green-600">{fmtKrw(b)}</td>
                      <td className="table-td text-right text-purple-600">{fmtKrw(b)}</td>
                      <td className="table-td text-right text-orange-600">{fmtKrw(ct - b * 2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
