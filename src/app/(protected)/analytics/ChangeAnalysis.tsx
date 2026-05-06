import { fmtNum } from '@/lib/margin'
import type { ChangeAnalysisResult, ProductChange } from './analytics-compute'

const SECTION_TITLE = '특이사항'

function causeBadgeClass(causeText: string): string {
  if (causeText === '신규 거래 시작')      return 'bg-blue-100 text-blue-700'
  if (causeText === '해당 기간 납품 없음') return 'bg-gray-100 text-gray-500'
  return 'bg-amber-50 text-amber-700'
}

function DeltaCell({
  label,
  delta,
  pct,
  isKrw = false,
}: {
  label: string
  delta: number
  pct: number | null
  isKrw?: boolean
}) {
  const threshold = isKrw ? 1 : 0.001
  if (Math.abs(delta) < threshold) {
    return (
      <div>
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        <p className="text-sm text-gray-300 font-medium">→</p>
      </div>
    )
  }

  const up      = delta > 0
  const color   = up ? 'text-green-600' : 'text-red-600'
  const arrow   = up ? '↑' : '↓'
  const sign    = up ? '+' : '-'
  const numPart = fmtNum(Math.abs(delta), isKrw ? 0 : 1)
  const unit    = isKrw ? '원' : '톤'
  const pctText = pct !== null
    ? `(${sign}${fmtNum(Math.abs(pct), 1)}%)`
    : '(신규)'

  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-base font-bold tabular-nums leading-tight ${color}`}>
        {arrow} {sign}{numPart}{unit}
      </p>
      <p className={`text-xs font-semibold tabular-nums ${color}`}>{pctText}</p>
    </div>
  )
}

function ChangeCard({ ch }: { ch: ProductChange }) {
  return (
    <div className="card overflow-hidden flex flex-col h-full">
      {/* 상단: 품목명 + 납품처 + 원인 배지 — 모바일에서 배지 줄바꿈 허용 */}
      <div className="px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-gray-100">
        <span className="text-sm font-bold text-gray-800 shrink-0">{ch.displayName}</span>
        <span className="text-xs text-gray-400 shrink-0">{ch.buyer}</span>
        <span className={`sm:ml-auto shrink-0 text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${causeBadgeClass(ch.causeText)}`}>
          {ch.causeText}
        </span>
      </div>

      {/* 중단: 물량 / 마진 2열 — flex-1로 빈 공간 채워 카드 높이 통일 */}
      <div className="px-3 py-2.5 grid grid-cols-2 gap-3 flex-1">
        <DeltaCell label="물량" delta={ch.qtyDelta} pct={ch.qtyPct} />
        <DeltaCell label="마진" delta={ch.marginDelta} pct={ch.marginPct} isKrw />
      </div>

      {/* 하단: 단가 변동 있을 때만 */}
      {ch.priceChanged && ch.curSellPrice !== null && ch.prevSellPrice !== null && (
        <div className="px-3 pb-2 text-xs text-gray-500 border-t border-gray-50">
          단가: {fmtNum(ch.prevSellPrice, 0)} → {fmtNum(ch.curSellPrice, 0)}원/톤
        </div>
      )}

      {/* 배분 비율 변동 */}
      {ch.distributionChanged && (
        <div className="px-3 pb-2 text-xs text-purple-600 border-t border-gray-50">
          배분 비율 변동
        </div>
      )}
    </div>
  )
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
  const noChangePrefix =
    mode === 'month' ? '이번 달 변동 없음' :
    mode === 'year'  ? '이번 연도 변동 없음' :
    '이번 기간 변동 없음'
  const prevLabel = prevFromYM === prevToYM ? prevFromYM : `${prevFromYM} ~ ${prevToYM}`

  const visible  = changes.filter(ch => ch.causeText !== '변동 없음')
  const noChange = changes.filter(ch => ch.causeText === '변동 없음')
  const noChangeSummary = [...new Set(noChange.map(ch => ch.displayName))].join(', ')

  return (
    <div className="mt-6">
      {/* 섹션 헤더 — range 모드에서 비교 기간 레이블이 길어지므로 wrap 허용 */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-2">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide shrink-0">
          {SECTION_TITLE}
        </h3>
        <span className="text-xs text-gray-400">
          비교: {prevLabel} ({compLabel})
        </span>
      </div>

      {!hasPrevData ? (
        <div className="card px-3 py-3">
          <p className="text-xs text-amber-600 mb-2">
            비교 기준 데이터 없음 (2026년부터 집계)
          </p>
          {changes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">현재 기간 데이터 없음</p>
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
                  <span className="text-xs text-gray-500 tabular-nums">
                    {fmtNum(ch.curQtyTon, 1)}톤 · {fmtNum(ch.curMargin, 0)}원
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 2열 그리드 — 모바일은 1열 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {visible.map(ch => (
              <ChangeCard key={`${ch.name}_${ch.buyer}`} ch={ch} />
            ))}
          </div>

          {visible.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">변동 사항 없음</p>
          )}

          {noChange.length > 0 && (
            <p className="text-xs text-gray-400 mt-2 px-1">
              {noChangePrefix}: {noChangeSummary}
            </p>
          )}
        </>
      )}
    </div>
  )
}
