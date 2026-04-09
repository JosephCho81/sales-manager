'use client'

import { fmtKrw, fmtNum } from '@/lib/margin'
import type { ContractForMargin } from '@/lib/margin'

// ── 타입 ──
// calcMarginFromContract 반환값 + 필요 추가 필드
type MarginData = {
  total_margin: number
  quantity_ton: number
  exchange_rate_used?: number | null
  sell_price_krw: number
  cost_price_krw: number
  // 타입 호환 유지 (DeliveryForm에서 넘어오는 전체 결과)
  korea_a1?: number; geumhwa?: number; raseong?: number
}

type AddlMarginData = {
  total_margin: number
  quantity_ton: number
  korea_a1?: number; geumhwa?: number; raseong?: number
}

type CombinedMargin = {
  total: number; korea_a1: number; geumhwa: number; raseong: number
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

  const qty = mainMargin?.quantity_ton ?? 0
  const sellAmt = mainMargin ? mainMargin.sell_price_krw * qty : 0
  const costAmt = mainMargin ? mainMargin.cost_price_krw * qty : 0

  return (
    <div className="mb-5 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">마진 미리보기</p>

      {mainMargin && (
        <>
          {/* FeSi USD 환산 표시 */}
          {isFeSi && mainMargin.exchange_rate_used && contractForPreview && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-2 text-xs text-blue-700">
              <span className="font-semibold">USD 기준: </span>
              {fmtNum(contractForPreview.sell_price - contractForPreview.cost_price, 2)} USD/톤
              <span className="text-gray-500 mx-2">×</span>
              {fmtNum(qty, 3)} 톤
              <span className="text-gray-500 mx-2">=</span>
              <span className="font-bold">
                {fmtNum((contractForPreview.sell_price - contractForPreview.cost_price) * qty, 2)} USD
              </span>
              <span className="text-gray-400 ml-2">(환율 {fmtNum(mainMargin.exchange_rate_used)}원 적용)</span>
            </div>
          )}

          {/* 단가 × 물량 = 금액 */}
          <div className={`rounded-lg p-4 ${addlMargin ? 'bg-gray-50 border border-gray-200' : 'bg-blue-50 border border-blue-100'}`}>
            <p className={`text-xs font-semibold mb-3 ${addlMargin ? 'text-gray-600' : 'text-blue-700'}`}>
              {isFeSi
                ? `기본 물량 (${fesiRateInput ? '입력 환율' : '참고 환율'} ${fmtNum(mainMargin.exchange_rate_used ?? 0)}원 기준)`
                : '기본 물량'}
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">물량</span>
                <span className="font-medium text-gray-800">{fmtNum(qty, 3)} 톤</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">판매금액</span>
                <span className="font-semibold text-blue-700">{fmtKrw(sellAmt)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">원가금액</span>
                <span className="text-gray-600">{fmtKrw(costAmt)}</span>
              </div>
              <div className="flex justify-between items-center border-t border-gray-200 pt-1.5 mt-1">
                <span className="text-xs font-semibold text-gray-600">총 마진</span>
                <span className={`font-bold ${addlMargin ? 'text-gray-700' : 'text-blue-700'}`}>
                  {fmtKrw(mainMargin.total_margin)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {addlMargin && (
        <div className="rounded-lg p-4 bg-gray-50 border border-gray-200">
          <p className="text-xs font-semibold mb-3 text-gray-600">추가 배분 마진 (호진 배분)</p>
          <div className="flex justify-between items-center text-sm">
            <span className="text-xs text-gray-500">총 마진</span>
            <span className="font-bold text-gray-700">{fmtKrw(addlMargin.total_margin)}</span>
          </div>
        </div>
      )}

      {mainMargin && addlMargin && combinedMargin && (
        <div className="rounded-lg p-4 bg-blue-600 text-white">
          <p className="text-xs font-semibold text-blue-100 mb-3">합계 마진</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-blue-200">총 물량</p>
              <p className="font-semibold">{fmtNum(qty + (addlMargin?.quantity_ton ?? 0), 3)} 톤</p>
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
