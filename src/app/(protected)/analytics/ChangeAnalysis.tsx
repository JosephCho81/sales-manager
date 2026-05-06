import { fmtNum, fmtKrw } from '@/lib/margin'
import type { ChangeAnalysisResult } from './analytics-compute'

// 섹션 제목 — 추후 변경 시 이 상수만 수정
const SECTION_TITLE = '특이사항'

function DeltaIndicator({
  delta,
  pct,
  isKrw = false,
}: {
  delta: number
  pct: number | null
  isKrw?: boolean
}) {
  const threshold = isKrw ? 1 : 0.001
  if (Math.abs(delta) < threshold) {
    return <span className="text-gray-400">→ 변동 없음</span>
  }
  const up     = delta > 0
  const color  = up ? 'text-green-600' : 'text-red-600'
  const arrow  = up ? '↑' : '↓'
  const sign   = up ? '+' : ''
  const value  = isKrw
    ? `${sign}${fmtKrw(delta)}`
    : `${sign}${fmtNum(delta, 3)}톤`
  const pctStr = pct !== null
    ? ` (${sign}${fmtNum(pct, 1)}%)`
    : ' (신규)'

  return (
    <span className={color}>
      {arrow} {value}{pctStr}
    </span>
  )
}

function causeBadgeClass(causeText: string): string {
  if (causeText === '변동 없음')         return 'bg-gray-100 text-gray-400'
  if (causeText === '신규 거래 시작')    return 'bg-blue-100 text-blue-700'
  if (causeText === '해당 기간 납품 없음') return 'bg-gray-100 text-gray-500'
  return 'bg-amber-50 text-amber-700'
}

export default function ChangeAnalysis({
  analysis,
  mode,
}: {
  analysis: ChangeAnalysisResult
  mode: 'month' | 'range' | 'year'
}) {
  const { changes, hasPrevData, prevFromYM, prevToYM } = analysis

  const compLabel =
    mode === 'month' ? '전월 대비' :
    mode === 'year'  ? '전년 동기 대비' :
    '직전 동일 기간 대비'
  const prevLabel = prevFromYM === prevToYM ? prevFromYM : `${prevFromYM} ~ ${prevToYM}`

  // 품목별 그룹핑 (PRODUCT_ORDER 정렬은 buildChangeAnalysis에서 완료)
  const groupKeys: string[] = []
  const groups: Record<string, typeof changes> = {}
  for (const ch of changes) {
    if (!groups[ch.name]) {
      groups[ch.name] = []
      groupKeys.push(ch.name)
    }
    groups[ch.name].push(ch)
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          {SECTION_TITLE}
        </h3>
        <span className="text-xs text-gray-400">
          비교: {prevLabel} ({compLabel})
        </span>
      </div>

      {!hasPrevData ? (
        <div className="card p-4">
          <p className="text-xs text-amber-600 mb-3">
            비교 기준 데이터 없음 (2026년부터 집계)
          </p>
          {changes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">현재 기간 데이터 없음</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {changes.filter(ch => ch.curQtyTon > 0).map(ch => (
                <div
                  key={`${ch.name}_${ch.buyer}`}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-xs font-medium text-gray-700">
                    {ch.displayName} / {ch.buyer}
                  </span>
                  <span className="text-xs text-gray-500">
                    {fmtNum(ch.curQtyTon, 1)}톤 · {fmtKrw(ch.curMargin)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {groupKeys.map(name => {
            const rows = groups[name]
            const first = rows[0]
            return (
              <div key={name} className="card overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-700">{first.displayName}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {rows.map(ch => {
                    const noChange = ch.causeText === '변동 없음'
                    return (
                      <div
                        key={ch.buyer}
                        className={`px-4 py-3 ${noChange ? 'opacity-50' : ''}`}
                      >
                        {/* 납품처 + 원인 뱃지 */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600">{ch.buyer}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${causeBadgeClass(ch.causeText)}`}>
                            {ch.causeText}
                          </span>
                        </div>

                        {/* 물량 · 마진 변동 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-400 w-8 shrink-0">물량</span>
                            <DeltaIndicator delta={ch.qtyDelta} pct={ch.qtyPct} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-400 w-8 shrink-0">마진</span>
                            <DeltaIndicator delta={ch.marginDelta} pct={ch.marginPct} isKrw />
                          </div>

                          {/* 단가 변동 */}
                          {ch.priceChanged && ch.curSellPrice !== null && ch.prevSellPrice !== null && (
                            <div className="col-span-full flex items-center gap-1.5 text-amber-700">
                              <span className="text-gray-400 w-8 shrink-0">단가</span>
                              <span>
                                {fmtNum(ch.prevSellPrice, 0)} → {fmtNum(ch.curSellPrice, 0)}원/톤
                              </span>
                            </div>
                          )}

                          {/* 배분 비율 변동 */}
                          {ch.distributionChanged && (
                            <div className="col-span-full flex items-center gap-1.5 text-purple-600">
                              <span className="text-gray-400 w-8 shrink-0">배분</span>
                              <span>에이원 배분 비율 변동</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
