import { fmtKrw, fmtNum } from '@/lib/margin'
import type { DeliveryDetail } from './types'

// ────────────────────────────────────────────────────────
// FeSiScheduleTable — 섹션 3: 입고별 계산서 일정 카드
// ────────────────────────────────────────────────────────
export default function FeSiScheduleTable({
  yearMonth,
  deliveryDetails,
}: {
  yearMonth: string
  deliveryDetails: DeliveryDetail[]
}) {
  if (deliveryDetails.length === 0) {
    return (
      <div className="card px-4 py-8 text-center text-sm text-gray-400">
        {yearMonth} FeSi 입고 데이터 없음
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {deliveryDetails.map(d => (
        <div key={d.id} className="card overflow-hidden">
          {/* 헤더 */}
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex justify-between items-start">
            <div>
              <span className="text-sm font-semibold text-gray-900">{d.product?.display_name}</span>
              <span className="ml-3 text-sm text-gray-600">BL 날짜: <strong>{d.blDate}</strong></span>
              <span className="ml-3 text-sm text-gray-600">{fmtNum(d.qtyTon, 3)} 톤</span>
            </div>
            <div className="text-right">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                d.rateSource === 'BL기준' ? 'bg-green-100 text-green-700'
                : d.rateSource === '계약참고' ? 'bg-yellow-100 text-yellow-700'
                : 'bg-red-100 text-red-700'
              }`}>
                {d.rateSource}
              </span>
              <p className="text-sm font-bold text-blue-700 mt-1">
                {fmtNum(d.rateUsed, 2)} 원/USD
                {d.actualRate && d.refRate && d.actualRate !== d.refRate && (
                  <span className="text-xs text-gray-400 ml-1">(참고: {fmtNum(d.refRate, 0)})</span>
                )}
              </p>
            </div>
          </div>

          {/* 계산서 일정 */}
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* ① 동국제강 역발행 */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">① 동국제강 역발행 (BL 당일)</p>
              <p className="text-xs text-gray-400">발행기준일</p>
              <p className="text-sm font-bold text-gray-900">{d.blDate}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">공급가액</span>
                  <span className="font-medium">{fmtKrw(d.sellKrw)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">VAT (10%)</span>
                  <span>{fmtKrw(d.sellKrw * 0.1)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold border-t border-gray-200 pt-1">
                  <span>합계</span>
                  <span className="text-blue-600">{fmtKrw(d.sellKrw * 1.1)}</span>
                </div>
              </div>
            </div>

            {/* ② EG 지급 */}
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-600 mb-2">② EG 지급 (BL +15일)</p>
              <p className="text-xs text-gray-400">지급 기한</p>
              <p className="text-sm font-bold text-blue-800">{d.egPayDeadline}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">USD</span>
                  <span className="font-semibold text-blue-700">${fmtNum(d.costUsd, 2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">원화 환산</span>
                  <span className="font-medium">{fmtKrw(d.costKrw)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">VAT</span>
                  <span>{fmtKrw(d.costKrw * 0.1)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold border-t border-blue-200 pt-1">
                  <span>합계 (KRW)</span>
                  <span className="text-blue-700">{fmtKrw(d.costKrw * 1.1)}</span>
                </div>
              </div>
            </div>

            {/* ③ 동국 대금 수령 */}
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-green-600 mb-2">③ 동국 대금 수령 (BL +10일)</p>
              <p className="text-xs text-gray-400">수령 기한</p>
              <p className="text-sm font-bold text-green-800">{d.receiveDeadline}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">매출 (KRW)</span>
                  <span>{fmtKrw(d.sellKrw)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">원가 (KRW)</span>
                  <span>{fmtKrw(d.costKrw)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold border-t border-green-200 pt-1">
                  <span>순 마진</span>
                  <span className={d.marginKrw >= 0 ? 'text-green-700' : 'text-red-600'}>
                    {fmtKrw(d.marginKrw)}
                  </span>
                </div>
              </div>
              {!d.actualRate && (
                <p className="mt-2 text-xs text-yellow-600">
                  ⚠ BL 기준 환율 미입력 — 참고 환율 사용 중
                </p>
              )}
            </div>
          </div>

          {d.memo && <div className="px-4 pb-3 text-xs text-gray-400">{d.memo}</div>}
        </div>
      ))}

      {/* 월 합계 */}
      <div className="card p-4 bg-gray-50">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">{yearMonth} FeSi 합계</p>
            <p className="text-sm text-gray-600">
              총 {fmtNum(deliveryDetails.reduce((s, d) => s + d.qtyTon, 0), 3)} 톤
            </p>
          </div>
          <div className="grid grid-cols-3 gap-6 text-right">
            <div>
              <p className="text-xs text-gray-400">매출 (KRW)</p>
              <p className="text-base font-bold text-gray-900">
                {fmtKrw(deliveryDetails.reduce((s, d) => s + d.sellKrw, 0))}
              </p>
            </div>
            <div>
              <p className="text-xs text-blue-400">원가 (USD)</p>
              <p className="text-base font-bold text-blue-700">
                ${fmtNum(deliveryDetails.reduce((s, d) => s + d.costUsd, 0), 2)}
              </p>
              <p className="text-xs text-gray-400">
                {fmtKrw(deliveryDetails.reduce((s, d) => s + d.costKrw, 0))}
              </p>
            </div>
            <div>
              <p className="text-xs text-green-500">순 마진</p>
              <p className="text-base font-bold text-green-700">
                {fmtKrw(deliveryDetails.reduce((s, d) => s + d.marginKrw, 0))}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
