'use client'

import { fmtKrw, fmtNum } from '@/lib/margin'
import type { ContractForMargin } from '@/lib/margin'

// ── 타입 ──
type MarginData = {
  total_margin: number; korea_a1: number; geumhwa: number; raseong: number
  quantity_ton: number; exchange_rate_used?: number | null
}

type AddlMarginData = {
  total_margin: number; korea_a1: number; geumhwa: number; raseong: number
  quantity_ton: number
}

type CombinedMargin = {
  total: number; korea_a1: number; geumhwa: number; raseong: number
}

// ── MarginBox — 물량 + 총마진만 표시 (3사 배분 제외) ──
function MarginBox({
  label, total, qty_ton, accent = false,
}: {
  label: string; total: number; qty_ton: number; accent?: boolean
}) {
  return (
    <div className={`rounded-lg p-4 ${accent ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-200'}`}>
      <p className={`text-xs font-semibold mb-3 ${accent ? 'text-blue-700' : 'text-gray-600'}`}>{label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>
          <p className="text-xs text-gray-400">물량</p>
          <p className="font-semibold text-gray-800">{fmtNum(qty_ton, 3)} 톤</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">총 마진</p>
          <p className={`font-bold ${accent ? 'text-blue-700' : 'text-gray-700'}`}>{fmtKrw(total)}</p>
        </div>
      </div>
    </div>
  )
}

// ── MarginPreview ──
export default function MarginPreview({
  mainMargin,
  addlMargin,
  combinedMargin,
  isFeSi,
  fesiRateInput,
  contractForPreview,
}: {
  mainMargin: MarginData | null
  addlMargin: AddlMarginData | null
  combinedMargin: CombinedMargin | null
  isFeSi: boolean
  fesiRateInput: string
  contractForPreview: ContractForMargin | null
}) {
  if (!mainMargin && !addlMargin) return null

  return (
    <div className="mb-5 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">마진 미리보기</p>

      {mainMargin && (
        <>
          {isFeSi && mainMargin.exchange_rate_used && contractForPreview && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-2 text-xs text-blue-700">
              <span className="font-semibold">USD 마진: </span>
              {fmtNum(contractForPreview.sell_price - contractForPreview.cost_price, 2)} USD/톤
              <span className="text-gray-500 mx-2">×</span>
              {fmtNum(mainMargin.quantity_ton, 3)} 톤
              <span className="text-gray-500 mx-2">=</span>
              <span className="font-bold">
                {fmtNum((contractForPreview.sell_price - contractForPreview.cost_price) * mainMargin.quantity_ton, 2)} USD
              </span>
              <span className="text-gray-400 ml-2">(환율 {fmtNum(mainMargin.exchange_rate_used)}원 적용)</span>
            </div>
          )}
          <MarginBox
            label={isFeSi
              ? `기본 물량 마진 (${fesiRateInput ? '입력 환율' : '참고 환율'} ${fmtNum(mainMargin.exchange_rate_used ?? 0)}원 기준)`
              : '기본 물량 마진'}
            total={mainMargin.total_margin}
            qty_ton={mainMargin.quantity_ton} accent={!addlMargin}
          />
        </>
      )}

      {addlMargin && (
        <MarginBox
          label="추가 배분 마진 (호진 배분)"
          total={addlMargin.total_margin}
          qty_ton={addlMargin.quantity_ton}
        />
      )}

      {mainMargin && addlMargin && combinedMargin && (
        <div className="rounded-lg p-4 bg-blue-600 text-white">
          <p className="text-xs font-semibold text-blue-100 mb-3">합계 마진</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-blue-200">총 물량</p>
              <p className="font-semibold">{fmtNum(mainMargin.quantity_ton + (addlMargin?.quantity_ton ?? 0), 3)} 톤</p>
            </div>
            <div>
              <p className="text-xs text-blue-200">총 마진</p>
              <p className="text-xl font-bold">{fmtKrw(combinedMargin.total)}</p>
            </div>
          </div>
        </div>
      )}

      {isFeSi && !contractForPreview?.reference_exchange_rate && !fesiRateInput && (
        <p className="text-xs text-yellow-600">
          ⚠ 참고 환율이 없습니다. 위 BL 환율 입력란에 실제 환율을 입력하면 마진 미리보기가 표시됩니다.
        </p>
      )}
    </div>
  )
}
