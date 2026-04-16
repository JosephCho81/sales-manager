import { fmtKrw } from '@/lib/margin'
import type { MarginTotals, CommissionsInPeriod } from './analytics-compute'

export default function SummaryCards({
  totals,
  commissionsInPeriod,
}: {
  totals: MarginTotals
  commissionsInPeriod: CommissionsInPeriod
}) {
  return (
    <>
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1.5">3사 배분 현황</h3>
      <div className="grid grid-cols-3 gap-3 mb-3 items-stretch">
        {/* 한국에이원 */}
        <div className="card p-3 flex flex-col">
          <div className="text-sm font-bold text-green-700 uppercase tracking-wider mb-2">한국에이원</div>
          <div className="space-y-2 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">매출 (동국/현대)</span>
              <span className="text-sm tabular-nums font-medium whitespace-nowrap">{fmtKrw(totals.sellKrw)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">매입 (화림 등)</span>
              <span className="text-sm tabular-nums text-gray-600 whitespace-nowrap">{fmtKrw(totals.costKrw)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">납품 마진</span>
              <span className="text-sm tabular-nums font-medium text-gray-800 whitespace-nowrap">{fmtKrw(totals.a1 - commissionsInPeriod.all.a1)}</span>
            </div>
            {commissionsInPeriod.dongkuk.a1 > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-600">동국 커미션</span>
                <span className="text-sm tabular-nums font-medium text-amber-700 whitespace-nowrap">{fmtKrw(commissionsInPeriod.dongkuk.a1)}</span>
              </div>
            )}
            {commissionsInPeriod.hyundai.a1 > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-600">현대 커미션</span>
                <span className="text-sm tabular-nums font-medium text-amber-700 whitespace-nowrap">{fmtKrw(commissionsInPeriod.hyundai.a1)}</span>
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between items-center">
            <span className="text-sm text-gray-500">한국에이원 마진</span>
            <span className="text-lg font-bold text-green-600 whitespace-nowrap">{fmtKrw(totals.a1)}</span>
          </div>
        </div>

        {/* 금화 */}
        <div className="card p-3 flex flex-col">
          <div className="text-sm font-bold text-purple-700 uppercase tracking-wider mb-2">금화</div>
          <div className="space-y-2 flex-1">
            {totals.geumhwaSellKrw > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">매출</span>
                <span className="text-sm tabular-nums font-medium whitespace-nowrap">{fmtKrw(totals.geumhwaSellKrw)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">납품 마진</span>
              <span className="text-sm tabular-nums font-medium text-gray-800 whitespace-nowrap">{fmtKrw(totals.gm - commissionsInPeriod.all.gm)}</span>
            </div>
            {commissionsInPeriod.dongkuk.gm > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-600">동국 커미션</span>
                <span className="text-sm tabular-nums font-medium text-amber-700 whitespace-nowrap">{fmtKrw(commissionsInPeriod.dongkuk.gm)}</span>
              </div>
            )}
            {commissionsInPeriod.hyundai.gm > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-600">현대 커미션</span>
                <span className="text-sm tabular-nums font-medium text-amber-700 whitespace-nowrap">{fmtKrw(commissionsInPeriod.hyundai.gm)}</span>
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between items-center">
            <span className="text-sm text-gray-500">금화 마진</span>
            <span className="text-lg font-bold text-purple-600 whitespace-nowrap">{fmtKrw(totals.gm)}</span>
          </div>
        </div>

        {/* 라성 */}
        <div className="card p-3 flex flex-col">
          <div className="text-sm font-bold text-orange-700 uppercase tracking-wider mb-2">라성</div>
          <div className="space-y-2 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">납품 마진</span>
              <span className="text-sm tabular-nums font-medium text-gray-800 whitespace-nowrap">{fmtKrw(totals.rs - commissionsInPeriod.all.rs)}</span>
            </div>
            {commissionsInPeriod.dongkuk.rs > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-600">동국 커미션</span>
                <span className="text-sm tabular-nums font-medium text-amber-700 whitespace-nowrap">{fmtKrw(commissionsInPeriod.dongkuk.rs)}</span>
              </div>
            )}
            {commissionsInPeriod.hyundai.rs > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-600">현대 커미션</span>
                <span className="text-sm tabular-nums font-medium text-amber-700 whitespace-nowrap">{fmtKrw(commissionsInPeriod.hyundai.rs)}</span>
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between items-center">
            <span className="text-sm text-gray-500">라성 마진</span>
            <span className="text-lg font-bold text-orange-600 whitespace-nowrap">{fmtKrw(totals.rs)}</span>
          </div>
        </div>
      </div>
    </>
  )
}
