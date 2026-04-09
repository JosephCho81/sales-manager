import { fmtKrw } from '@/lib/margin'
import type { MonthlyData } from './analytics-compute'

// ── CSS 기반 막대 차트 (외부 라이브러리 없음) ──
export default function MarginBarChart({ data }: { data: MonthlyData[] }) {
  const maxVal = Math.max(...data.map(d => d.totalMargin), 1)
  const H = 150

  return (
    <div className="w-full overflow-x-auto pb-2">
      {/* 범례 */}
      <div className="flex gap-4 text-xs text-gray-500 mb-3">
        {[
          { color: 'bg-green-500',  label: '한국에이원' },
          { color: 'bg-purple-500', label: '금화' },
          { color: 'bg-orange-500', label: '라성' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm inline-block ${color}`} />
            {label}
          </span>
        ))}
      </div>

      {/* 바 */}
      <div
        className="flex items-end gap-1"
        style={{ minWidth: `${data.length * 52}px`, height: `${H + 28}px` }}
      >
        {data.map(d => {
          const a1H    = Math.max(d.a1 / maxVal * H, d.a1 > 0 ? 2 : 0)
          const gmH    = Math.max(d.gm / maxVal * H, d.gm > 0 ? 2 : 0)
          const rsH    = Math.max(d.rs / maxVal * H, d.rs > 0 ? 2 : 0)
          const totalH = d.totalMargin > 0 ? d.totalMargin / maxVal * H : 0
          return (
            <div key={d.ym} className="flex-1 flex flex-col items-center min-w-0">
              <div
                className="relative flex items-end justify-center gap-0.5 w-full"
                style={{ height: `${H}px` }}
                title={`${d.ym}\n총마진: ${fmtKrw(d.totalMargin)}\n한국에이원: ${fmtKrw(d.a1)}\n금화: ${fmtKrw(d.gm)}\n라성: ${fmtKrw(d.rs)}`}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 bg-blue-50 opacity-0 hover:opacity-100 transition-opacity rounded-t-sm"
                  style={{ height: `${totalH}px` }}
                />
                <div className="w-3 bg-green-500 hover:bg-green-600 transition-colors rounded-t-sm" style={{ height: `${a1H}px` }} />
                <div className="w-3 bg-purple-500 hover:bg-purple-600 transition-colors rounded-t-sm" style={{ height: `${gmH}px` }} />
                <div className="w-3 bg-orange-500 hover:bg-orange-600 transition-colors rounded-t-sm" style={{ height: `${rsH}px` }} />
              </div>
              <span className="text-xs text-gray-500 mt-1 truncate w-full text-center">
                {d.ym.slice(5)}월
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
