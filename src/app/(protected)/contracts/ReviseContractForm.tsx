'use client'

import { useState } from 'react'
import { reviseContract } from './actions'
import { fmtNum } from '@/lib/margin'
import type { ContractRow } from './types'

// 낙찰 단가 "기간 중 개정" 폼.
//   원본 계약을 변경 적용일 직전까지로 자르고, 적용일~원본종료일에 새 단가 행을 만든다.
//   판매단가는 그대로 두고 매입단가만 바꾸는 경우(소괴탄/렘코)가 대표 시나리오.
export default function ReviseContractForm({
  contract,
  onClose,
  onRevised,
}: {
  contract: ContractRow
  onClose: () => void
  onRevised: (newRow: ContractRow, originalRow: ContractRow) => void
}) {
  const isUsd = contract.currency === 'USD'
  const unit = isUsd ? 'USD/톤' : '원/톤'

  // 적용일 기본값: 원본 시작일 다음 달 1일이 아니라, 사용자가 직접 고르도록 빈 값 시작
  const [effectiveDate, setEffectiveDate] = useState('')
  const [sellPrice, setSellPrice] = useState(String(contract.sell_price))
  const [costPrice, setCostPrice] = useState(String(contract.cost_price))
  const [refRate, setRefRate] = useState(
    contract.reference_exchange_rate ? String(contract.reference_exchange_rate) : ''
  )
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const sellNum = parseFloat(sellPrice)
  const costNum = parseFloat(costPrice)
  const rateNum = parseFloat(refRate)
  const marginPerTon =
    isUsd && rateNum > 0 ? (sellNum - costNum) * rateNum : sellNum - costNum

  const origStart = contract.start_date.slice(0, 10)
  const origEnd = contract.end_date.slice(0, 10)

  async function handleSave() {
    if (!effectiveDate) { setError('변경 적용일을 입력하세요.'); return }
    if (effectiveDate <= origStart) { setError(`적용일은 원본 시작일(${origStart}) 이후여야 합니다.`); return }
    if (effectiveDate > origEnd) { setError(`적용일은 원본 종료일(${origEnd}) 이내여야 합니다.`); return }
    if (!costNum || costNum <= 0) { setError('새 매입단가를 입력하세요.'); return }
    if (!sellNum || sellNum <= 0) { setError('새 판매단가를 입력하세요.'); return }
    if (isUsd && (!rateNum || rateNum <= 0)) { setError('USD 계약은 참고 환율이 필요합니다.'); return }
    if (!reason.trim()) { setError('개정 사유를 입력하세요.'); return }

    setSaving(true); setError('')
    const result = await reviseContract({
      original_id: contract.id,
      effective_date: effectiveDate,
      sell_price: sellNum,
      cost_price: costNum,
      reference_exchange_rate: isUsd ? rateNum : null,
      reason: reason.trim(),
    })
    if (result.error || !result.data?.newRow || !result.data?.originalRow) {
      setError(result.error ?? '개정 결과를 읽지 못했습니다.')
      setSaving(false)
      return
    }
    onRevised(
      result.data.newRow as unknown as ContractRow,
      result.data.originalRow as unknown as ContractRow
    )
  }

  return (
    <div className="card p-5 mb-6 border-amber-300 border-2">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">
        단가 개정 — <span className="text-amber-700">{contract.product?.display_name}</span>
      </h3>
      <p className="text-xs text-gray-500 mb-5">
        원본 기간 {origStart} ~ {origEnd}. 적용일 직전까지는 기존 단가, 적용일부터 원본 종료일까지는 새 단가가 적용됩니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">변경 적용일 *</label>
          <input type="date" className="input" value={effectiveDate}
            min={origStart} max={origEnd}
            onChange={e => setEffectiveDate(e.target.value)} />
          <p className="mt-1 text-xs text-gray-400">이 날짜부터 새 단가 적용 (이전 기간은 기존 단가 유지)</p>
        </div>
        <div>
          <label className="label">개정 사유 *</label>
          <input className="input" value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="예: 렘코 단가 조정 요청" />
        </div>

        <div>
          <label className="label">새 판매단가 * <span className="text-gray-400 font-normal">({unit})</span></label>
          <input type="number" className="input" value={sellPrice}
            onChange={e => setSellPrice(e.target.value)}
            step={isUsd ? '0.01' : '100'} />
          <p className="mt-1 text-xs text-gray-400">변동 없으면 그대로 두세요</p>
        </div>
        <div>
          <label className="label">새 매입단가 * <span className="text-gray-400 font-normal">({unit})</span></label>
          <input type="number" className="input" value={costPrice}
            onChange={e => setCostPrice(e.target.value)}
            step={isUsd ? '0.01' : '100'} />
        </div>

        {isUsd && (
          <div>
            <label className="label">참고 환율 * <span className="text-gray-400 font-normal">(원/USD)</span></label>
            <input type="number" className="input" value={refRate}
              onChange={e => setRefRate(e.target.value)} step="1" />
          </div>
        )}
      </div>

      {sellNum > 0 && costNum > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 p-4 text-sm">
          <span className="text-xs text-gray-500">새 마진 단가: </span>
          <span className={`font-bold ${marginPerTon >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
            {fmtNum(marginPerTon)} 원/톤
          </span>
          {isUsd && rateNum > 0 && (
            <span className="text-xs text-gray-400 ml-2">({fmtNum(sellNum - costNum, 2)} USD/톤 × {fmtNum(rateNum)})</span>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '개정 중...' : '개정 저장'}
        </button>
        <button className="btn-secondary" onClick={onClose}>취소</button>
      </div>
    </div>
  )
}
