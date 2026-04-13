'use client'

import { fmtKrw, fmtNum } from '@/lib/margin'
import type { ContractForMargin } from '@/lib/margin'

type MarginData = {
  total_margin: number
  quantity_ton: number
  exchange_rate_used?: number | null
  sell_price_krw: number
  cost_price_krw: number
  korea_a1?: number; geumhwa?: number; raseong?: number
  /** 감가 적용 시 설정 — 미리보기 표시용 조정 합계 */
  sell_price_krw_total?: number
  cost_price_krw_total?: number
  depreciation_amount?: number
}

export default function MarginPreview({
  mainMargin,
  isFeSi,
  fesiRateInput,
  contractForPreview,
}: {
  mainMargin: MarginData | null
  isFeSi: boolean
  fesiRateInput: string
  contractForPreview: ContractForMargin | null
}) {
  if (!mainMargin) return null

  const qty     = mainMargin.quantity_ton
  const dep     = mainMargin.depreciation_amount ?? 0
  const sellAmt = mainMargin.sell_price_krw_total ?? mainMargin.sell_price_krw * qty
  const costAmt = mainMargin.cost_price_krw_total ?? mainMargin.cost_price_krw * qty

  return (
    <div className="mb-5 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">마진 미리보기</p>

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

      <div className="rounded-lg p-4 bg-blue-50 border border-blue-100">
        <p className="text-xs font-semibold mb-3 text-blue-700">
          {isFeSi
            ? `${fesiRateInput ? '입력 환율' : '참고 환율'} ${fmtNum(mainMargin.exchange_rate_used ?? 0)}원 기준`
            : '마진 계산'}
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
          {dep > 0 && (
            <div className="flex justify-between items-center text-orange-600">
              <span className="text-xs">감가</span>
              <span className="text-sm font-medium">-{fmtKrw(dep)}</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t border-gray-200 pt-1.5 mt-1">
            <span className="text-xs font-semibold text-gray-600">총 마진</span>
            <span className="font-bold text-blue-700">{fmtKrw(mainMargin.total_margin)}</span>
          </div>
        </div>
      </div>

      {isFeSi && !contractForPreview?.reference_exchange_rate && !fesiRateInput && (
        <p className="text-xs text-yellow-600">
          ⚠ 참고 환율이 없습니다. 위 BL 환율 입력란에 실제 환율을 입력하면 마진 미리보기가 표시됩니다.
        </p>
      )}
    </div>
  )
}
