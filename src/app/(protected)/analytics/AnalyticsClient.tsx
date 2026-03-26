'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { calcMarginFromContract, calcAddlMargin, fmtKrw, fmtNum } from '@/lib/margin'

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────
type DeliveryRaw = {
  id: string
  year_month: string
  product_id: string
  quantity_kg: number
  addl_quantity_kg: number | null
  addl_margin_per_ton: number | null
  product: { id: string; name: string; display_name: string; buyer: string; vat: string } | null
  contract: {
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
  } | null
}

type InvRow = {
  id: string
  year_month: string
  product_id: string | null
  from_company: string
  to_company: string
  supply_amount: number
  vat_amount: number
  total_amount: number
  invoice_basis_date: string | null
  payment_due_date: string | null
  is_paid: boolean
  paid_at: string | null
  invoice_type: string | null
  memo: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수 및 유틸리티
// ─────────────────────────────────────────────────────────────────────────────
const VENDORS = ['화림', '렘코', '동창', 'EG'] as const
type Vendor = (typeof VENDORS)[number]

function getVendor(inv: InvRow): Vendor | null {
  for (const v of VENDORS) {
    if (inv.from_company === v || inv.to_company === v) return v
  }
  return null
}

function parseEgUsd(memo: string | null): number | null {
  if (!memo) return null
  const m = memo.match(/USD\s+([\d.]+)/)
  return m ? parseFloat(m[1]) : null
}

function sumAmt(invs: InvRow[], paid?: boolean): number {
  return invs
    .filter(i => paid === undefined || i.is_paid === paid)
    .reduce((s, i) => s + Number(i.total_amount), 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// 계산 함수들
// ─────────────────────────────────────────────────────────────────────────────
function computeCompany(deliveries: DeliveryRaw[], invoices: InvRow[]) {
  let a1Margin = 0, gmMargin = 0, rsMargin = 0
  for (const d of deliveries) {
    if (!d.contract) continue
    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    a1Margin += m.korea_a1
    gmMargin += m.geumhwa
    rsMargin += m.raseong
    if (d.addl_quantity_kg && d.addl_margin_per_ton) {
      const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
      a1Margin += am.korea_a1
      gmMargin += am.geumhwa
      rsMargin += am.raseong
    }
  }

  return {
    a1Margin,
    gmMargin,
    rsMargin,
    salesInvs:  invoices.filter(i => i.to_company === '한국에이원' && i.invoice_type === 'sales'),
    costInvs:   invoices.filter(i => i.invoice_type === 'cost'),
    commInvs:   invoices.filter(i => i.from_company === '한국에이원' && i.invoice_type === 'commission'),
    gmCommInvs: invoices.filter(i => i.to_company === '금화' && i.invoice_type === 'commission'),
    rsCommInvs: invoices.filter(i => i.to_company === '라성' && i.invoice_type === 'commission'),
  }
}

type ProductRow = {
  productId: string
  displayName: string
  buyer: string
  qtyTon: number
  sellKrw: number
  costKrw: number
  costUsd: number | null
  totalMargin: number
  a1: number
  gm: number
  rs: number
}

function computeProductRows(deliveries: DeliveryRaw[]): ProductRow[] {
  const map = new Map<string, ProductRow>()

  for (const d of deliveries) {
    if (!d.contract || !d.product) continue
    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    const isFeSi = d.contract.currency === 'USD'
    const costUsdDelta = isFeSi ? d.contract.cost_price * m.quantity_ton : 0

    let amTotal = 0, amA1 = 0, amGm = 0, amRs = 0
    if (d.addl_quantity_kg && d.addl_margin_per_ton) {
      const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
      amTotal = am.total_margin; amA1 = am.korea_a1; amGm = am.geumhwa; amRs = am.raseong
    }

    const existing = map.get(d.product_id)
    if (existing) {
      existing.qtyTon      += m.quantity_ton
      existing.sellKrw     += m.sell_price * m.quantity_ton
      existing.costKrw     += m.cost_price_krw * m.quantity_ton
      existing.totalMargin += m.total_margin + amTotal
      existing.a1          += m.korea_a1 + amA1
      existing.gm          += m.geumhwa  + amGm
      existing.rs          += m.raseong  + amRs
      if (isFeSi) existing.costUsd = (existing.costUsd ?? 0) + costUsdDelta
    } else {
      map.set(d.product_id, {
        productId:   d.product_id,
        displayName: d.product.display_name,
        buyer:       d.product.buyer,
        qtyTon:      m.quantity_ton,
        sellKrw:     m.sell_price * m.quantity_ton,
        costKrw:     m.cost_price_krw * m.quantity_ton,
        costUsd:     isFeSi ? costUsdDelta : null,
        totalMargin: m.total_margin + amTotal,
        a1:          m.korea_a1 + amA1,
        gm:          m.geumhwa  + amGm,
        rs:          m.raseong  + amRs,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
}

// ─────────────────────────────────────────────────────────────────────────────
// 하위 컴포넌트: 회사 카드 내 행
// ─────────────────────────────────────────────────────────────────────────────
function CompanyRow({
  label,
  value,
  paid,
  unpaid,
  isOut,
}: {
  label: string
  value: number
  paid: number
  unpaid: number
  isOut?: boolean
}) {
  if (value === 0 && paid === 0 && unpaid === 0) {
    return (
      <div className="mb-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">{label}</span>
          <span className="text-xs text-gray-300">—</span>
        </div>
      </div>
    )
  }
  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-xs text-gray-500">{label}</span>
        <span className={`text-sm font-semibold ${isOut ? 'text-gray-700' : 'text-blue-600'}`}>
          {fmtKrw(value)}
        </span>
      </div>
      <div className="flex justify-end gap-3 text-xs">
        {paid > 0 && <span className="text-green-600">완료 {fmtKrw(paid)}</span>}
        {unpaid > 0 && <span className="text-red-500">잔액 {fmtKrw(unpaid)}</span>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 하위 컴포넌트: 거래처 카드
// ─────────────────────────────────────────────────────────────────────────────
function VendorCard({ vendor, invoices }: { vendor: string; invoices: InvRow[] }) {
  const paid   = sumAmt(invoices, true)
  const unpaid = sumAmt(invoices, false)
  const isEG   = vendor === 'EG'

  const egUsdUnpaid = isEG
    ? invoices.filter(i => !i.is_paid).reduce((s, i) => s + (parseEgUsd(i.memo) ?? 0), 0)
    : 0
  const egUsdPaid = isEG
    ? invoices.filter(i => i.is_paid).reduce((s, i) => s + (parseEgUsd(i.memo) ?? 0), 0)
    : 0

  return (
    <div className="card overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-start">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{vendor}</h4>
          {isEG && (egUsdPaid > 0 || egUsdUnpaid > 0) && (
            <p className="text-xs text-gray-400 mt-0.5">
              {egUsdPaid > 0 && <span className="text-green-600">완료 ${fmtNum(egUsdPaid, 0)} </span>}
              {egUsdUnpaid > 0 && <span className="text-red-500">미지급 ${fmtNum(egUsdUnpaid, 0)}</span>}
            </p>
          )}
        </div>
        <div className="text-right">
          {unpaid > 0 && (
            <p className="text-sm font-bold text-red-600">{fmtKrw(unpaid)}</p>
          )}
          {paid > 0 && (
            <p className="text-xs text-gray-400">{fmtKrw(paid)} 완료</p>
          )}
          {paid === 0 && unpaid === 0 && (
            <p className="text-xs text-gray-300">이력 없음</p>
          )}
        </div>
      </div>

      {/* 이력 테이블 */}
      {invoices.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-gray-400">지급 이력 없음</div>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white shadow-sm z-10">
              <tr>
                <th className="table-th">연월</th>
                {isEG && <th className="table-th text-right">USD</th>}
                <th className="table-th text-right">원화(VAT포함)</th>
                <th className="table-th whitespace-nowrap">지급예정일</th>
                <th className="table-th text-center w-12">완료</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const egUsd = isEG ? parseEgUsd(inv.memo) : null
                return (
                  <tr
                    key={inv.id}
                    className={`border-t border-gray-100 hover:bg-gray-50 ${inv.is_paid ? 'opacity-40' : ''}`}
                  >
                    <td className="table-td">{inv.year_month}</td>
                    {isEG && (
                      <td className="table-td text-right text-blue-600 tabular-nums">
                        {egUsd != null ? `$${fmtNum(egUsd, 0)}` : '—'}
                      </td>
                    )}
                    <td className="table-td text-right tabular-nums">
                      {fmtKrw(Number(inv.total_amount))}
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {inv.payment_due_date ?? '—'}
                    </td>
                    <td className="table-td text-center">
                      {inv.is_paid ? (
                        <span className="text-green-500 font-bold">✓</span>
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────
export default function AnalyticsClient({
  yearMonth,
  initialDeliveries,
  monthInvoices,
  allCostInvoices,
}: {
  yearMonth: string
  initialDeliveries: DeliveryRaw[]
  monthInvoices: InvRow[]
  allCostInvoices: InvRow[]
}) {
  const router = useRouter()
  const [selectedProduct, setSelectedProduct] = useState<string>('all')

  // 이 달에 입고된 품목 목록
  const products = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of initialDeliveries) {
      if (d.product && !seen.has(d.product_id)) seen.set(d.product_id, d.product.display_name)
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [initialDeliveries])

  // 품목 필터 적용
  const filtDeliveries = useMemo(
    () =>
      selectedProduct === 'all'
        ? initialDeliveries
        : initialDeliveries.filter(d => d.product_id === selectedProduct),
    [initialDeliveries, selectedProduct]
  )
  const filtInvoices = useMemo(
    () =>
      selectedProduct === 'all'
        ? monthInvoices
        : monthInvoices.filter(i => i.product_id === selectedProduct),
    [monthInvoices, selectedProduct]
  )
  const filtCostInvoices = useMemo(
    () =>
      selectedProduct === 'all'
        ? allCostInvoices
        : allCostInvoices.filter(i => i.product_id === selectedProduct),
    [allCostInvoices, selectedProduct]
  )

  const co = useMemo(() => computeCompany(filtDeliveries, filtInvoices), [filtDeliveries, filtInvoices])
  const productRows = useMemo(() => computeProductRows(filtDeliveries), [filtDeliveries])

  // 거래처별 그룹화
  const vendorMap = useMemo(() => {
    const m = new Map<Vendor, InvRow[]>(VENDORS.map(v => [v, []]))
    for (const inv of filtCostInvoices) {
      const v = getVendor(inv)
      if (v) m.get(v)!.push(inv)
    }
    return m
  }, [filtCostInvoices])

  // 전체 합계 (product table footer용)
  const totals = useMemo(
    () => ({
      qtyTon:      productRows.reduce((s, r) => s + r.qtyTon, 0),
      sellKrw:     productRows.reduce((s, r) => s + r.sellKrw, 0),
      costKrw:     productRows.reduce((s, r) => s + r.costKrw, 0),
      totalMargin: productRows.reduce((s, r) => s + r.totalMargin, 0),
      a1:          productRows.reduce((s, r) => s + r.a1, 0),
      gm:          productRows.reduce((s, r) => s + r.gm, 0),
      rs:          productRows.reduce((s, r) => s + r.rs, 0),
    }),
    [productRows]
  )

  // ─────────────────────────────────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* 헤더 + 필터 */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">매출·마진 현황</h2>
          <p className="text-sm text-gray-500 mt-0.5">각사별 수익 및 거래처 지급 이력</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={yearMonth}
            onChange={e => router.push(`/analytics?month=${e.target.value}`)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={selectedProduct}
            onChange={e => setSelectedProduct(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">전체 품목</option>
            {products.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── 1. 회사별 현황 ─── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        회사별 현황
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">

        {/* 한국에이원 */}
        <div className="card p-5">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
            한국에이원
          </div>
          <CompanyRow
            label="수취 매출"
            value={sumAmt(co.salesInvs)}
            paid={sumAmt(co.salesInvs, true)}
            unpaid={sumAmt(co.salesInvs, false)}
          />
          <CompanyRow
            label="지급 원가"
            value={sumAmt(co.costInvs)}
            paid={sumAmt(co.costInvs, true)}
            unpaid={sumAmt(co.costInvs, false)}
            isOut
          />
          <CompanyRow
            label="커미션 지급 (금화+라성)"
            value={sumAmt(co.commInvs)}
            paid={sumAmt(co.commInvs, true)}
            unpaid={sumAmt(co.commInvs, false)}
            isOut
          />
          <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between items-center">
            <span className="text-xs text-gray-500">순 마진 배분</span>
            <span className="text-lg font-bold text-green-600">{fmtKrw(co.a1Margin)}</span>
          </div>
        </div>

        {/* 금화 */}
        <div className="card p-5">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
            금화
          </div>
          <div className="mb-3 flex justify-between items-center">
            <span className="text-xs text-gray-500">수취 커미션 (계산값)</span>
            <span className="text-base font-bold text-purple-600">{fmtKrw(co.gmMargin)}</span>
          </div>
          <CompanyRow
            label="계산서 발행 기준"
            value={sumAmt(co.gmCommInvs)}
            paid={sumAmt(co.gmCommInvs, true)}
            unpaid={sumAmt(co.gmCommInvs, false)}
          />
          <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between items-center">
            <span className="text-xs text-red-400">미수취 잔액</span>
            <span className="text-lg font-bold text-red-600">{fmtKrw(sumAmt(co.gmCommInvs, false))}</span>
          </div>
        </div>

        {/* 라성 */}
        <div className="card p-5">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
            라성
          </div>
          <div className="mb-3 flex justify-between items-center">
            <span className="text-xs text-gray-500">수취 커미션 (계산값)</span>
            <span className="text-base font-bold text-orange-600">{fmtKrw(co.rsMargin)}</span>
          </div>
          <CompanyRow
            label="계산서 발행 기준"
            value={sumAmt(co.rsCommInvs)}
            paid={sumAmt(co.rsCommInvs, true)}
            unpaid={sumAmt(co.rsCommInvs, false)}
          />
          <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between items-center">
            <span className="text-xs text-red-400">미수취 잔액</span>
            <span className="text-lg font-bold text-red-600">{fmtKrw(sumAmt(co.rsCommInvs, false))}</span>
          </div>
        </div>
      </div>

      {/* ─── 2. 품목별 마진 현황 ─── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        품목별 마진 현황
      </h3>
      {productRows.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-gray-400 mb-8">
          {yearMonth} 입고 데이터가 없습니다.
        </div>
      ) : (
        <div className="card overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">품목</th>
                  <th className="table-th">납품처</th>
                  <th className="table-th text-right">물량(톤)</th>
                  <th className="table-th text-right">매출</th>
                  <th className="table-th text-right">원가</th>
                  <th className="table-th text-right">총마진</th>
                  <th className="table-th text-right text-green-700">한국에이원</th>
                  <th className="table-th text-right text-purple-700">금화</th>
                  <th className="table-th text-right text-orange-700">라성</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map(row => (
                  <tr key={row.productId} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="table-td font-medium">
                      {row.displayName}
                      {row.costUsd != null && (
                        <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1 py-0.5 rounded">USD</span>
                      )}
                    </td>
                    <td className="table-td text-gray-500">{row.buyer}</td>
                    <td className="table-td text-right tabular-nums">{fmtNum(row.qtyTon, 3)}</td>
                    <td className="table-td text-right tabular-nums">{fmtKrw(row.sellKrw)}</td>
                    <td className="table-td text-right tabular-nums">
                      {fmtKrw(row.costKrw)}
                      {row.costUsd != null && (
                        <div className="text-xs text-blue-500 tabular-nums">
                          ${fmtNum(row.costUsd, 0)}
                        </div>
                      )}
                    </td>
                    <td className="table-td text-right tabular-nums font-semibold text-blue-600">
                      {fmtKrw(row.totalMargin)}
                    </td>
                    <td className="table-td text-right tabular-nums text-green-600">
                      {fmtKrw(row.a1)}
                    </td>
                    <td className="table-td text-right tabular-nums text-purple-600">
                      {fmtKrw(row.gm)}
                    </td>
                    <td className="table-td text-right tabular-nums text-orange-600">
                      {fmtKrw(row.rs)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {productRows.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td colSpan={2} className="px-4 py-2.5 text-sm">합계</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                      {fmtNum(totals.qtyTon, 3)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                      {fmtKrw(totals.sellKrw)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                      {fmtKrw(totals.costKrw)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-blue-700 tabular-nums">
                      {fmtKrw(totals.totalMargin)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-green-700 tabular-nums">
                      {fmtKrw(totals.a1)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-purple-700 tabular-nums">
                      {fmtKrw(totals.gm)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-orange-700 tabular-nums">
                      {fmtKrw(totals.rs)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ─── 3. 거래처별 지급 현황 ─── */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        거래처별 지급 현황
        {selectedProduct !== 'all' && (
          <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
            (전체 이력 표시 — 월 필터 미적용)
          </span>
        )}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {VENDORS.map(vendor => (
          <VendorCard key={vendor} vendor={vendor} invoices={vendorMap.get(vendor) ?? []} />
        ))}
      </div>
    </div>
  )
}
