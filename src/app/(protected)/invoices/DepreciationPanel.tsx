'use client'

import { Fragment, useState } from 'react'
import { useCanEdit } from '@/components/RoleProvider'
import { useRouter } from 'next/navigation'
import { fmtKrw } from '@/lib/margin'
import { depKind, sumUnsettled, sumUnrecovered, depImpactsFor } from '@/lib/depreciation'
import { depDefaultDeliveryMonth } from '@/lib/invoice-generator'
import { toMessage } from '@/lib/error'
import type { MonthlyDepreciation } from '@/types'
import type { InvoiceRow } from '@/lib/invoice-generator'
import { BADGE_TONE, DepBreakdownNote } from './InvoiceTable'
import {
  upsertMonthlyDepreciation,
  deleteMonthlyDepreciation,
  setDepreciationSettled,
} from './depreciation-actions'

export type DepProduct = {
  id: string
  name: string
  label: string
  /** 계산서 자동 반영 지원 여부 — 미지원 품목은 입력을 막는다 */
  supported: boolean
}

type Kind = 'hold' | 'passthrough'

const KIND_META: Record<Kind, { label: string; hint: string; cls: string }> = {
  hold: {
    label: '보관형',
    hint: '매입 계산서만 차감하고 매출·커미션은 총액 유지 — 감가액이 통장에 남아 나중에 공급처로 반환 (분탄)',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  passthrough: {
    label: '통과형',
    hint: '매출이 감액 발행돼 마진·커미션이 그달에 줄고, 회수월 매입 계산서에서 되돌아옴 (소괴탄·AL-30)',
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
}

/**
 * 월별 감가 관리 — 품목 무관 공통 패널.
 *
 * 품목을 고르지 않으면 "분탄에 넣어두는" 사고가 난다(2026-08 소괴탄 감가 212,078원이
 * 분탄 매입에서 차감된 사례). 그래서 품목은 항상 명시 선택이고, 유형(보관/통과)도
 * 라디오로 강제한다 — 둘이 뒤바뀌면 커미션이 조용히 틀린다.
 */
export default function DepreciationPanel({
  products,
  deps,
  invoices,
  invoiceMonth,
}: {
  products: DepProduct[]
  deps: MonthlyDepreciation[]
  /** 이번 조회월 계산서 — 감가가 실제로 어느 장에 얼마로 반영됐는지 산식을 붙이는 데 쓴다 */
  invoices: InvoiceRow[]
  /** 현재 조회 중인 지급월 — 품목별 offset으로 기본 납품월을 정한다 */
  invoiceMonth: string
}) {
  const router  = useRouter()
  const canEdit = useCanEdit()

  const supported = products.filter(p => p.supported)
  const firstPid  = supported[0]?.id ?? ''

  const [pid, setPid]       = useState(firstPid)
  const [kind, setKind]     = useState<Kind>('hold')
  const [ym, setYm]         = useState('')
  const [costYm, setCostYm] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo]     = useState('')
  const [vat, setVat]       = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  // 수정 시작 시점의 updated_at — 그 사이 누가 감가를 바꿨으면 저장을 거부한다
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null)
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const productMap = new Map(products.map(p => [p.id, p]))
  const unsettled  = sumUnsettled(deps)
  const unrecovered = sumUnrecovered(deps)

  // 품목이 정해지면 그 품목의 발행 offset으로 기본 납품월을 잡는다 (분탄 M−1, AL30 M−2)
  const defaultYm = pid
    ? depDefaultDeliveryMonth(productMap.get(pid)?.name ?? '', invoiceMonth)
    : ''
  const effYm     = ym || defaultYm
  const effCostYm = costYm || effYm

  function reset() {
    setEditId(null); setEditUpdatedAt(null)
    setPid(firstPid); setKind('hold')
    setYm(''); setCostYm(''); setAmount(''); setMemo(''); setVat('')
  }

  function startEdit(d: MonthlyDepreciation) {
    setEditId(d.id)
    setEditUpdatedAt(d.updated_at ?? null)
    setPid(d.product_id)
    setKind(depKind(d))
    setYm(d.year_month)
    setCostYm(d.cost_deduct_ym ?? d.year_month)
    setAmount(String(Number(d.amount)))
    setMemo(d.memo ?? '')
    setVat(d.cost_vat_actual == null ? '' : String(Number(d.cost_vat_actual)))
    setError(null)
  }

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true); setError(null)
    try {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      reset()
      router.refresh() // 계산서 금액도 서버에서 재생성됨 — 서버 데이터 재조회
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function save() {
    return upsertMonthlyDepreciation({
      id: editId ?? undefined,
      updated_at: editUpdatedAt,
      product_id: pid,
      year_month: effYm,
      amount,
      memo,
      // 보관형은 매출 영향 없음 — null로 보내야 depKind가 보관형으로 판정된다
      sales_deduct_ym: kind === 'passthrough' ? effYm : null,
      cost_deduct_ym: effCostYm,
      cost_vat_actual: vat,
    })
  }

  const sorted = [...deps].sort((a, b) =>
    b.year_month.localeCompare(a.year_month) ||
    (productMap.get(a.product_id)?.label ?? '').localeCompare(productMap.get(b.product_id)?.label ?? ''),
  )

  return (
    <div className="card mb-6 p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-gray-900">
          감가 관리
          <span className="ml-1 font-normal text-xs text-gray-400">
            — 품목·납품월 단위. 저장하면 해당 월 계산서가 자동 재생성됩니다
          </span>
        </h3>
        <p className="text-sm flex gap-4">
          <span>
            보관 미정산 <span className="font-bold text-amber-700 tabular-nums">{fmtKrw(unsettled)}</span>
          </span>
          <span>
            미회수 <span className="font-bold text-red-600 tabular-nums">{fmtKrw(unrecovered)}</span>
          </span>
        </p>
      </div>

      {sorted.length > 0 && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-200">
                <th className="py-1.5 text-left font-medium whitespace-nowrap">품목</th>
                <th className="py-1.5 text-left font-medium whitespace-nowrap">귀속 납품월</th>
                <th className="py-1.5 text-right font-medium whitespace-nowrap">감가액</th>
                <th className="py-1.5 pl-3 text-left font-medium whitespace-nowrap">유형</th>
                <th className="py-1.5 pl-3 text-left font-medium whitespace-nowrap">반영 위치</th>
                <th className="py-1.5 pl-3 text-left font-medium">메모</th>
                <th className="py-1.5 text-right font-medium whitespace-nowrap">상태</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(d => {
                const k = depKind(d)
                const meta = KIND_META[k]
                // 이번 조회월 계산서 중 이 감가가 실제로 반영된 장 — 없으면 다른 달에 반영된 것
                const impacts = depImpactsFor(d, invoices, deps)
                return (
                  <Fragment key={d.id}>
                  <tr className="border-t border-gray-100">
                    <td className="py-2 font-medium whitespace-nowrap">
                      {productMap.get(d.product_id)?.label ?? d.product_id}
                    </td>
                    <td className="py-2 tabular-nums whitespace-nowrap">{d.year_month}</td>
                    <td className="py-2 text-right tabular-nums font-medium whitespace-nowrap">
                      {fmtKrw(Number(d.amount))}
                    </td>
                    <td className="py-2 pl-3 whitespace-nowrap">
                      <span className={`inline-block rounded border px-1.5 py-0.5 ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td className="py-2 pl-3 text-gray-500 tabular-nums whitespace-nowrap">
                      {k === 'passthrough' && <>매출 {d.sales_deduct_ym} · </>}
                      매입 {d.cost_deduct_ym ?? d.year_month}
                    </td>
                    <td className="py-2 pl-3 text-gray-400">
                      {d.memo}
                      {d.cost_vat_actual != null && (
                        <span className="ml-2 text-amber-700">부가세 실계산서 {fmtKrw(Number(d.cost_vat_actual))}</span>
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {!canEdit ? (
                        <span className={d.settled_at ? 'text-green-600' : 'text-gray-300'}>
                          {d.settled_at ? '정산완료' : '미정산'}
                        </span>
                      ) : (<>
                        <button disabled={busy} className="text-gray-500 underline mr-2"
                          onClick={() => startEdit(d)}>수정</button>
                        {d.settled_at ? (
                          <span className="text-green-600">
                            정산완료
                            <button disabled={busy} className="text-gray-400 underline ml-2"
                              onClick={() => run(() => setDepreciationSettled(d.id, false))}>취소</button>
                          </span>
                        ) : (
                          <>
                            <button disabled={busy} className="text-blue-600 underline"
                              onClick={() => run(() => setDepreciationSettled(d.id, true))}>정산완료</button>
                            <button disabled={busy} className="text-red-400 underline ml-2"
                              onClick={() => {
                                const label = productMap.get(d.product_id)?.label ?? ''
                                if (confirm(`${label} ${d.year_month} 감가 ${fmtKrw(Number(d.amount))}을(를) 삭제할까요?\n해당 월 계산서가 총액으로 재생성됩니다.`)) {
                                  run(() => deleteMonthlyDepreciation(d.id))
                                }
                              }}>삭제</button>
                          </>
                        )}
                      </>)}
                    </td>
                  </tr>
                  {impacts.length > 0 && (
                    <tr key={`${d.id}-impact`}>
                      <td colSpan={7} className="pb-3 pl-0">
                        <div className="flex flex-wrap gap-3">
                          {impacts.map(im => (
                            <div key={im.invoiceId} className="min-w-[18rem]">
                              <p className="text-xs text-gray-500">
                                <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 mr-1.5 font-medium">
                                  {im.role === 'sales' ? '매출' : '매입'}
                                </span>
                                {im.from} <span className="text-gray-300">→</span> {im.to}
                              </p>
                              {im.badge && (
                                <p className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-xs font-medium leading-snug ${BADGE_TONE[im.badge.tone]}`}>
                                  {im.badge.text}
                                </p>
                              )}
                              {im.breakdown && <DepBreakdownNote bd={im.breakdown} />}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs text-gray-400 mb-1">품목</label>
            <select value={pid} onChange={e => { setPid(e.target.value); setYm(''); setCostYm('') }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              {products.map(p => (
                <option key={p.id} value={p.id} disabled={!p.supported}>
                  {p.label}{p.supported ? '' : ' (자동 반영 미지원)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">귀속 납품월</label>
            <input type="month" value={effYm} onChange={e => setYm(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">감가 금액(원)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="예: 212078" min="1" step="1"
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-32" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              매입 차감월{kind === 'passthrough' ? ' (회수월)' : ''}
            </label>
            <input type="month" value={effCostYm} onChange={e => setCostYm(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">부가세 실계산서(선택)</label>
            <input type="number" value={vat} onChange={e => setVat(e.target.value)}
              placeholder="비우면 자동" min="0" step="1"
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-32" />
          </div>
          <div className="flex-1 min-w-[8rem]">
            <label className="block text-xs text-gray-400 mb-1">메모</label>
            <input value={memo} onChange={e => setMemo(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full" />
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {(['hold', 'passthrough'] as Kind[]).map(k => (
            <label key={k} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" name="dep-kind" checked={kind === k} onChange={() => setKind(k)} />
              <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${KIND_META[k].cls}`}>
                {KIND_META[k].label}
              </span>
            </label>
          ))}
          <button disabled={busy || !amount || !pid}
            className="btn-primary text-xs disabled:opacity-40"
            onClick={() => run(save)}>
            {busy ? '저장 중…' : editId ? '감가 수정' : '감가 저장'}
          </button>
          {editId && (
            <button disabled={busy} className="text-xs text-gray-500 underline" onClick={reset}>취소</button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-2">{KIND_META[kind].hint}</p>
      </div>
      )}

      <p className="text-xs text-gray-400 mt-2">
        <b>부가세 실계산서</b>는 매입처 실물 세금계산서의 세액이 자동 계산값과 다를 때만 입력합니다(끝자리 1원 차이).
        비워두면 &quot;매입 총액 부가세 − 감가 부가세&quot;(라인별)로 계산합니다.
      </p>
      {products.some(p => !p.supported) && (
        <p className="text-xs text-gray-400 mt-1">
          {products.filter(p => !p.supported).map(p => p.label).join('·')}은(는) 매입 계산서가 여러 장이거나
          입고 건별 발행이라 어느 장에서 차감할지가 정해져 있지 않습니다. 실제 감가가 발생하면 반영 규칙을
          확정한 뒤 열겠습니다.
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
    </div>
  )
}
