'use client'

import { Fragment, useState } from 'react'
import { useCanEdit } from '@/components/RoleProvider'
import { useRouter } from 'next/navigation'
import { fmtKrw } from '@/lib/margin'
import {
  depPolicyFor, depEffectLine, carryBalances, pendingRecovery,
  depImpactsFor, vatActualConflicts,
} from '@/lib/depreciation'
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

/**
 * 월별 감가 관리 — 품목 무관 공통 패널.
 *
 * 감가가 어느 계산서에 어떻게 반영되는지는 품목이 정한다(lib/depreciation.ts의 DEP_POLICIES).
 * 예전에는 담당자가 보관형·통과형을 직접 골랐는데, 뒤바뀌면 커미션이 조용히 틀리는 데다
 * 용어 자체가 화면에서 이해되지 않았다. 지금은 품목만 고르면 반영 위치가 정해지고,
 * 화면에는 그 결과를 평문 한 줄로 보여준다.
 *
 * 이 페이지의 주인공은 계산서 목록이지 감가가 아니다. 그래서 패널 전체가 기본 접힘이고,
 * 펼쳐도 먼저 보이는 건 잔액과 입력 폼이다. 등록된 감가 내역은 그 안에서 한 번 더 접는다.
 *
 * 품목 선택은 여전히 명시적이다 — 2026-08 소괴탄 감가 212,078원이 분탄 product_id로
 * 저장돼 동창 매입에서 차감된 사고가 품목 선택 없는 전용 패널 때문이었다.
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

  const [pid, setPid]           = useState(firstPid)
  const [notified, setNotified] = useState('')
  const [ym, setYm]             = useState('')
  const [costYm, setCostYm]     = useState('')
  const [amount, setAmount]     = useState('')
  const [memo, setMemo]         = useState('')
  const [vat, setVat]           = useState('')
  const [editId, setEditId]     = useState<string | null>(null)
  // 수정 시작 시점의 updated_at — 그 사이 누가 감가를 바꿨으면 저장을 거부한다
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [listOpen, setListOpen]   = useState(false)
  const [openPids, setOpenPids]   = useState<Set<string>>(new Set())
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const productMap = new Map(products.map(p => [p.id, p]))
  const nameOf     = (productId: string) => productMap.get(productId)?.name ?? ''
  const policyOf   = (productId: string) => depPolicyFor(nameOf(productId))
  const formPolicy = policyOf(pid)

  const balanceRows = deps.map(d => ({
    amount: Number(d.amount), settled_at: d.settled_at, productName: nameOf(d.product_id),
  }))
  const carries  = carryBalances(balanceRows)
  const pendings = pendingRecovery(balanceRows)
  // 한 달에 감가가 여러 건인 경우 실물 부가세는 한 건에만 — 둘 이상이면 조용히 무시된다
  const vatConflicts = vatActualConflicts(deps)

  // 접힌 상태에서도 미정산이 얼마인지는 보여야 한다 — 펼치지 않으면 잊어버린다
  const headline = [
    ...carries.map(c => `${c.party} 연말 정리 ${fmtKrw(Math.abs(c.net))} ${c.net >= 0 ? '받을 돈' : '줄 돈'}`),
    ...pendings.map(p => `${p.party} 회수 대기 ${fmtKrw(p.amount)}`),
  ].join(' · ')

  // 품목이 정해지면 그 품목의 발행 offset으로 기본 납품월을 잡는다 (분탄 M−1, AL30 M−2)
  const defaultYm = pid ? depDefaultDeliveryMonth(nameOf(pid), invoiceMonth) : ''
  const effYm     = ym || defaultYm
  const effCostYm = costYm || effYm

  function reset() {
    setEditId(null); setEditUpdatedAt(null)
    setPid(firstPid); setNotified('')
    setYm(''); setCostYm(''); setAmount(''); setMemo(''); setVat('')
  }

  function startEdit(d: MonthlyDepreciation) {
    setEditId(d.id)
    setEditUpdatedAt(d.updated_at ?? null)
    setPid(d.product_id)
    setNotified(d.notified_on ?? '')
    setYm(d.year_month)
    setCostYm(d.cost_deduct_ym ?? '')
    setAmount(String(Number(d.amount)))
    setMemo(d.memo ?? '')
    setVat(d.cost_vat_actual == null ? '' : String(Number(d.cost_vat_actual)))
    setError(null)
  }

  function toggleProduct(productId: string) {
    setOpenPids(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
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
      notified_on: notified || null,
      // 반영 위치는 서버가 품목 규칙으로 정한다. 회수월은 규칙이 허용하는 품목에서만 쓰인다
      cost_deduct_ym: formPolicy?.costMonthChosen ? effCostYm : null,
      cost_vat_actual: vat,
    })
  }

  // 품목 단위로 묶어 접는다 — 감가가 쌓이면 행만 늘어나 어느 품목이 얼마인지 안 보인다.
  // 같은 품목 안에서는 최근 납품월 먼저, 같은 달이면 통보 순서대로
  const groups = products
    .map(p => ({
      product: p,
      rows: deps
        .filter(d => d.product_id === p.id)
        .sort((a, b) =>
          b.year_month.localeCompare(a.year_month) ||
          (a.notified_on ?? '').localeCompare(b.notified_on ?? '') ||
          (a.created_at ?? '').localeCompare(b.created_at ?? '')),
    }))
    .filter(g => g.rows.length > 0)

  return (
    <div className="card mb-6">
      <button type="button" onClick={() => setPanelOpen(o => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50">
        <span className={`text-gray-400 transition-transform ${panelOpen ? 'rotate-90' : ''}`}>▸</span>
        <span className="text-sm font-bold text-gray-900">감가 관리</span>
        <span className="text-xs text-gray-400">{deps.length}건</span>
        {headline && (
          <span className="ml-auto text-xs text-gray-500 tabular-nums text-right">{headline}</span>
        )}
      </button>

      {panelOpen && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          {(carries.length > 0 || pendings.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {carries.map(c => (
                <div key={c.party} className="rounded border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-bold text-gray-800">{c.party} 연말 정리</p>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500">받을 돈</dt>
                      <dd className="tabular-nums text-gray-800">{fmtKrw(c.receive)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500">돌려줄 돈</dt>
                      <dd className="tabular-nums text-gray-800">{fmtKrw(c.pay)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-gray-200 pt-1 font-bold">
                      <dt className="text-gray-700">순액 {c.net >= 0 ? '받을 돈' : '돌려줄 돈'}</dt>
                      <dd className="tabular-nums text-gray-900">{fmtKrw(Math.abs(c.net))}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-gray-400">
                    계산서에 반영되지 않는 금액입니다. 연말에 별도 명목으로 한 번에 발행하세요.
                  </p>
                </div>
              ))}
              {pendings.map(p => (
                <div key={p.party} className="rounded border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-bold text-gray-800">{p.party} 매입 회수 미완료</p>
                  <p className="mt-2 text-lg font-bold tabular-nums text-gray-900">{fmtKrw(p.amount)}</p>
                  <p className="mt-2 text-xs text-gray-400">
                    회수 계산서가 나가면 해당 감가를 정산완료로 닫으세요.
                  </p>
                </div>
              ))}
            </div>
          )}

          {vatConflicts.length > 0 && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded">
              {vatConflicts.map(c => `${productMap.get(c.product_id)?.label ?? c.product_id} ${c.cost_deduct_ym} (${c.count}건)`).join(', ')}
              — 같은 매입 계산서에 실물 부가세가 여러 건 입력됐습니다. 계산서 한 장의 세액이라 합칠 수 없어
              자동 계산값으로 발행됩니다. 한 건만 남기고 나머지는 비우세요.
            </p>
          )}

          {canEdit && (
            <div className="mt-4">
              <p className="text-xs font-bold text-gray-500 mb-2">
                {editId ? '감가 수정' : '감가 입력'}
              </p>
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
                  <label className="block text-xs text-gray-400 mb-1">통보일</label>
                  <input type="date" value={notified} onChange={e => setNotified(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
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
                {/* 회수월은 건별 합의로 갈리는 품목(AL-30·AL-40)에서만 묻는다 */}
                {formPolicy?.costMonthChosen && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      {formPolicy.costParty} 매입 회수월
                    </label>
                    <input type="month" value={effCostYm} onChange={e => setCostYm(e.target.value)}
                      className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
                  </div>
                )}
                {/* 매입 계산서를 건드리지 않는 품목(소괴탄)은 실물 세액을 넣을 계산서가 없다 */}
                {formPolicy?.costParty && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">부가세 실계산서(선택)</label>
                    <input type="number" value={vat} onChange={e => setVat(e.target.value)}
                      placeholder="비우면 자동" min="0" step="1"
                      className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-32" />
                  </div>
                )}
                <div className="flex-1 min-w-[8rem]">
                  <label className="block text-xs text-gray-400 mb-1">메모</label>
                  <input value={memo} onChange={e => setMemo(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full" />
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <button disabled={busy || !amount || !pid}
                  className="btn-primary text-xs disabled:opacity-40"
                  onClick={() => run(save)}>
                  {busy ? '저장 중…' : editId ? '감가 수정' : '감가 저장'}
                </button>
                {editId && (
                  <button disabled={busy} className="text-xs text-gray-500 underline" onClick={reset}>취소</button>
                )}
              </div>

              {formPolicy && (
                <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded px-3 py-2">
                  <b>{productMap.get(pid)?.label}</b> {formPolicy.summary}
                </p>
              )}
              {formPolicy?.costParty && (
                <p className="text-xs text-gray-400 mt-2">
                  <b>부가세 실계산서</b>는 {formPolicy.costParty} 실물 세금계산서의 세액이 자동 계산값과 다를 때만
                  입력합니다(끝자리 1원 차이). 비워두면 &quot;매입 총액 부가세 − 감가 부가세&quot;(라인별)로 계산합니다.
                </p>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

          {groups.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <button type="button" onClick={() => setListOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
                <span className={`transition-transform ${listOpen ? 'rotate-90' : ''}`}>▸</span>
                등록된 감가 {deps.length}건 보기
              </button>

              {listOpen && (
                <div className="mt-2 space-y-2">
                  {groups.map(({ product, rows }) => {
                    const open      = openPids.has(product.id)
                    const total     = rows.reduce((s, d) => s + Number(d.amount), 0)
                    const policy    = policyOf(product.id)
                    const openCount = rows.filter(d => d.settled_at === null).length
                    return (
                      <div key={product.id} className="rounded border border-gray-200">
                        <button type="button" onClick={() => toggleProduct(product.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50">
                          <span className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
                          <span className="text-sm font-bold text-gray-900">{product.label}</span>
                          <span className="text-xs text-gray-400">{rows.length}건</span>
                          {openCount === 0 && <span className="text-xs text-green-600">전건 정산완료</span>}
                          <span className="ml-auto text-sm font-bold tabular-nums text-gray-900">{fmtKrw(total)}</span>
                        </button>
                        {policy && <p className="px-3 pb-2 pl-8 text-xs text-gray-400">{policy.summary}</p>}

                        {open && (
                          <div className="overflow-x-auto border-t border-gray-100 px-3 pb-2">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400">
                                  <th className="py-1.5 text-left font-medium whitespace-nowrap">통보일</th>
                                  <th className="py-1.5 pl-3 text-left font-medium whitespace-nowrap">귀속 납품월</th>
                                  <th className="py-1.5 pl-3 text-right font-medium whitespace-nowrap">감가액</th>
                                  <th className="py-1.5 pl-3 text-left font-medium whitespace-nowrap">반영 위치</th>
                                  <th className="py-1.5 pl-3 text-left font-medium">메모</th>
                                  <th className="py-1.5 pl-3 text-right font-medium whitespace-nowrap">상태</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map(d => {
                                  // 이번 조회월 계산서 중 이 감가가 실제로 반영된 장 — 없으면 다른 달에 반영된 것
                                  const impacts = depImpactsFor(d, invoices, deps)
                                  return (
                                    <Fragment key={d.id}>
                                      <tr className="border-t border-gray-100">
                                        <td className="py-2 tabular-nums whitespace-nowrap">
                                          {d.notified_on ?? <span className="text-gray-300">미입력</span>}
                                        </td>
                                        <td className="py-2 pl-3 tabular-nums whitespace-nowrap">{d.year_month}</td>
                                        <td className="py-2 pl-3 text-right tabular-nums font-medium whitespace-nowrap">
                                          {fmtKrw(Number(d.amount))}
                                        </td>
                                        <td className="py-2 pl-3 text-gray-500 whitespace-nowrap">
                                          {depEffectLine(policy, d)}
                                        </td>
                                        <td className="py-2 pl-3 text-gray-400">
                                          {d.memo}
                                          {d.cost_vat_actual != null && (
                                            <span className="ml-2 text-amber-700">부가세 실계산서 {fmtKrw(Number(d.cost_vat_actual))}</span>
                                          )}
                                        </td>
                                        <td className="py-2 pl-3 text-right whitespace-nowrap">
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
                                                    if (confirm(`${product.label} ${d.year_month} 감가 ${fmtKrw(Number(d.amount))}을(를) 삭제할까요?\n해당 월 계산서가 총액으로 재생성됩니다.`)) {
                                                      run(() => deleteMonthlyDepreciation(d.id))
                                                    }
                                                  }}>삭제</button>
                                              </>
                                            )}
                                          </>)}
                                        </td>
                                      </tr>
                                      {impacts.length > 0 && (
                                        <tr>
                                          <td colSpan={6} className="pb-2">
                                            {/* 기본은 접어둔다 — 감가가 여러 건이면 산식이 화면을 덮어 목록을 못 읽는다.
                                                대사할 때만 펼쳐 보는 값이므로 요약 한 줄을 summary로 둔다 */}
                                            <details className="group">
                                              <summary className="cursor-pointer list-none text-xs text-gray-400 hover:text-gray-600 select-none">
                                                <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
                                                반영 계산서 {impacts.length}장 · 산식 보기
                                                <span className="ml-2 text-gray-300">
                                                  {impacts.map(im => `${im.role === 'sales' ? '매출' : '매입'} ${im.to === '(주)한국에이원' ? im.from : im.to}`).join(' · ')}
                                                </span>
                                              </summary>
                                              <div className="mt-2 flex flex-wrap gap-3">
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
                                            </details>
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
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
