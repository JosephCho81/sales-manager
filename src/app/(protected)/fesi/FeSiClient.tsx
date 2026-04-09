'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { addDays } from '@/lib/date'
import FxRateSection from './FxRateSection'
import FeSiScheduleTable from './FeSiScheduleTable'
import type { FeSiProduct, FxRateRow, FeSiDeliveryRow as DeliveryRow } from './types'

// ────────────────────────────────────────────────────────
// FeSiClient — 얇은 코디네이터
//   - fxRates 상태 소유 (rateMap/deliveryDetails 계산에 필요)
//   - FxRateSection: 환율 입력 + 환율 기록 테이블
//   - FeSiScheduleTable: 입고별 계산서 일정 카드
// ────────────────────────────────────────────────────────
export default function FeSiClient({
  yearMonth,
  fesiProducts,
  initialDeliveries,
  initialFxRates,
}: {
  yearMonth: string
  fesiProducts: FeSiProduct[]
  initialDeliveries: DeliveryRow[]
  initialFxRates: FxRateRow[]
}) {
  const router = useRouter()
  const [fxRates, setFxRates] = useState<FxRateRow[]>(initialFxRates)

  const rateMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of fxRates) {
      m.set(`${r.product_id}:${r.bl_date}`, r.rate_krw_per_usd)
    }
    return m
  }, [fxRates])

  const deliveryDetails = useMemo(() =>
    initialDeliveries.map(d => {
      const refRate = d.contract?.reference_exchange_rate ?? null
      const actualRate = d.delivery_date
        ? (rateMap.get(`${d.product_id}:${d.delivery_date}`) ?? null)
        : null
      const rate = actualRate ?? refRate ?? 1
      const qtyTon = d.quantity_kg / 1000
      const sellKrw  = d.contract ? d.contract.sell_price * qtyTon : 0
      const costUsd  = d.contract ? d.contract.cost_price * qtyTon : 0
      const costKrw  = costUsd * rate
      const blDate = d.delivery_date ?? `${d.year_month}-15`
      return {
        ...d,
        refRate,
        actualRate,
        rateUsed: rate,
        rateSource: actualRate ? 'BL기준' : (refRate ? '계약참고' : '미설정'),
        qtyTon,
        sellKrw,
        costUsd,
        costKrw,
        marginKrw: sellKrw - costKrw,
        blDate,
        receiveDeadline: addDays(blDate, 10),
        egPayDeadline:   addDays(blDate, 15),
      }
    }), [initialDeliveries, rateMap]
  )

  function handleRateUpserted(rate: FxRateRow) {
    setFxRates(prev => {
      const key = `${rate.product_id}:${rate.bl_date}`
      const idx = prev.findIndex(r => `${r.product_id}:${r.bl_date}` === key)
      if (idx >= 0) { const next = [...prev]; next[idx] = rate; return next }
      return [rate, ...prev]
    })
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">페로실리콘 달러 처리</h2>
          <p className="text-sm text-gray-500 mt-0.5">BL 날짜 기준 환율 입력 · 원화 환산 · 지급 일정</p>
        </div>
        <input
          type="month" value={yearMonth}
          onChange={e => router.push(`/fesi?month=${e.target.value}`)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <FxRateSection
        fxRates={fxRates}
        fesiProducts={fesiProducts}
        onRateUpserted={handleRateUpserted}
        onRateDeleted={id => setFxRates(prev => prev.filter(r => r.id !== id))}
      />

      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        {yearMonth} 입고별 계산서 일정
      </h3>
      <FeSiScheduleTable yearMonth={yearMonth} deliveryDetails={deliveryDetails} />
    </div>
  )
}
