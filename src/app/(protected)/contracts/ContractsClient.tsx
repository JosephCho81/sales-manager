'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/types'

// ────────────────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────────────────
interface ContractRow {
  id: string
  product_id: string
  start_date: string
  end_date: string
  sell_price: number
  cost_price: number
  currency: 'KRW' | 'USD'
  reference_exchange_rate: number | null
  exchange_rate_basis: string | null
  memo: string | null
  created_at: string
  product: {
    id: string
    name: string
    display_name: string
    price_unit: string
  }
}

interface FormState {
  product_id: string
  start_date: string
  end_date: string
  sell_price: string       // KRW/ton (전 품목)
  cost_price: string       // KRW/ton 또는 USD/ton (FeSi)
  reference_exchange_rate: string  // FeSi 참고 환율 (원/USD)
  exchange_rate_basis: string      // 환율 기준 설명
  memo: string
}

const defaultForm: FormState = {
  product_id: '',
  start_date: '',
  end_date: '',
  sell_price: '',
  cost_price: '',
  reference_exchange_rate: '',
  exchange_rate_basis: 'BL 날짜 기준 동국제강 지정 환율',
  memo: '',
}

// ────────────────────────────────────────────────────────
// 헬퍼
// ────────────────────────────────────────────────────────
function fmtNum(n: number, decimals = 0) {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

function isFeSi(product?: Product | null): boolean {
  return product?.price_unit === 'USD_TON'
}

/** FeSi 마진 단가 (원/톤) 계산 — 판매·원가 모두 USD */
function fesiMarginPerTon(
  sellUsd: number,
  costUsd: number,
  rate: number
): number {
  return (sellUsd - costUsd) * rate
}

// ────────────────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────────────────
export default function ContractsClient({
  initialContracts,
  products,
}: {
  initialContracts: ContractRow[]
  products: Product[]
}) {
  const [contracts, setContracts] = useState<ContractRow[]>(initialContracts)
  const [filterProductId, setFilterProductId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 선택된 품목
  const selectedProduct = useMemo(
    () => products.find(p => p.id === form.product_id) ?? null,
    [products, form.product_id]
  )
  const isUsd = isFeSi(selectedProduct)

  // 마진 단가 미리보기
  const marginPreview = useMemo(() => {
    const sell = parseFloat(form.sell_price)
    const cost = parseFloat(form.cost_price)
    if (!sell || !cost) return null
    if (isUsd) {
      const rate = parseFloat(form.reference_exchange_rate)
      if (!rate) return null
      const marginUsd = sell - cost
      return {
        margin: marginUsd * rate,
        marginUsd,
        sellKrw: sell * rate,
        costKrw: cost * rate,
        rate,
      }
    }
    return { margin: sell - cost, marginUsd: null, sellKrw: null, costKrw: null, rate: null }
  }, [form.sell_price, form.cost_price, form.reference_exchange_rate, isUsd])

  // ────────────────────────
  // 폼 열기
  // ────────────────────────
  function openNew() {
    setEditId(null)
    setForm(defaultForm)
    setError('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openEdit(c: ContractRow) {
    setEditId(c.id)
    setForm({
      product_id: c.product_id,
      start_date: c.start_date.slice(0, 10),
      end_date: c.end_date.slice(0, 10),
      sell_price: String(c.sell_price),
      cost_price: String(c.cost_price),
      reference_exchange_rate: c.reference_exchange_rate ? String(c.reference_exchange_rate) : '',
      exchange_rate_basis: c.exchange_rate_basis ?? 'BL 날짜 기준 동국제강 지정 환율',
      memo: c.memo ?? '',
    })
    setError('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ────────────────────────
  // 저장
  // ────────────────────────
  async function handleSave() {
    // 유효성 검사
    if (!form.product_id) { setError('품목을 선택하세요.'); return }
    if (!form.start_date || !form.end_date) { setError('낙찰 기간을 입력하세요.'); return }
    if (form.start_date >= form.end_date) { setError('종료일은 시작일보다 이후여야 합니다.'); return }
    if (!form.sell_price || isNaN(parseFloat(form.sell_price))) { setError('판매단가를 입력하세요.'); return }
    if (!form.cost_price || isNaN(parseFloat(form.cost_price))) { setError('원가단가를 입력하세요.'); return }
    if (isUsd && (!form.reference_exchange_rate || isNaN(parseFloat(form.reference_exchange_rate)))) {
      setError('FeSi 품목은 참고 환율을 입력해야 합니다.')
      return
    }

    // 기간 겹침 검사 (같은 product)
    const overlapping = contracts.filter(c => {
      if (c.product_id !== form.product_id) return false
      if (editId && c.id === editId) return false
      return form.start_date < c.end_date && form.end_date > c.start_date
    })
    if (overlapping.length > 0) {
      const o = overlapping[0]
      setError(
        `기간이 겹칩니다: 기존 "${o.start_date} ~ ${o.end_date}" 계약과 충돌합니다.`
      )
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      product_id: form.product_id,
      start_date: form.start_date,
      end_date: form.end_date,
      sell_price: parseFloat(form.sell_price),
      cost_price: parseFloat(form.cost_price),
      currency: isUsd ? 'USD' : 'KRW',
      reference_exchange_rate: isUsd ? parseFloat(form.reference_exchange_rate) : null,
      exchange_rate_basis: isUsd ? (form.exchange_rate_basis || null) : null,
      memo: form.memo || null,
    }

    const supabase = createClient()
    let result
    if (editId) {
      result = await supabase
        .from('contracts')
        .update(payload)
        .eq('id', editId)
        .select('*, product:products(id, name, display_name, price_unit)')
        .single()
    } else {
      result = await supabase
        .from('contracts')
        .insert(payload)
        .select('*, product:products(id, name, display_name, price_unit)')
        .single()
    }

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    if (editId) {
      setContracts(prev => prev.map(c => c.id === editId ? result.data : c))
    } else {
      setContracts(prev => [result.data, ...prev])
    }
    setShowForm(false)
    setSaving(false)
  }

  // ────────────────────────
  // 삭제
  // ────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('이 낙찰 단가를 삭제하시겠습니까?\n연결된 입고 데이터가 있으면 삭제되지 않습니다.')) return
    const supabase = createClient()
    const { error: err } = await supabase.from('contracts').delete().eq('id', id)
    if (err) {
      alert('삭제 실패: ' + err.message)
      return
    }
    setContracts(prev => prev.filter(c => c.id !== id))
  }

  // ────────────────────────
  // 필터 / 목록
  // ────────────────────────
  const filtered = filterProductId
    ? contracts.filter(c => c.product_id === filterProductId)
    : contracts

  const today = new Date().toISOString().slice(0, 10)

  function statusBadge(c: ContractRow) {
    if (today >= c.start_date && today <= c.end_date)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">적용 중</span>
    if (today > c.end_date)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">종료</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">예정</span>
  }

  // ────────────────────────
  // 렌더링
  // ────────────────────────
  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">낙찰 단가 관리</h2>
          <p className="text-sm text-gray-500 mt-0.5">품목별 입찰 기간 및 납품단가·원가단가 관리</p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ 단가 등록</button>
      </div>

      {/* ── 등록 / 수정 폼 ── */}
      {showForm && (
        <div className="card p-5 mb-6 border-blue-200 border-2">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">
            {editId ? '낙찰 단가 수정' : '새 낙찰 단가 등록'}
            {isUsd && (
              <span className="ml-2 text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                FeSi — USD 거래
              </span>
            )}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* 품목 선택 */}
            <div className="md:col-span-2">
              <label className="label">품목 *</label>
              <select
                className="input"
                value={form.product_id}
                onChange={e => {
                  setForm(f => ({ ...f, product_id: e.target.value, sell_price: '', cost_price: '', reference_exchange_rate: '' }))
                }}
              >
                <option value="">품목을 선택하세요</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                    {p.price_unit === 'USD_TON' ? ' (USD 거래)' : ''} — {p.buyer}
                  </option>
                ))}
              </select>
            </div>

            {/* 낙찰 기간 */}
            <div>
              <label className="label">낙찰 시작일 *</label>
              <input
                type="date"
                className="input"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">낙찰 종료일 * <span className="text-gray-400 font-normal">(마지막 날 포함)</span></label>
              <input
                type="date"
                className="input"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              />
            </div>

            {/* ── KRW 품목 단가 ── */}
            {!isUsd && form.product_id && (
              <>
                <div>
                  <label className="label">판매단가 * <span className="text-gray-400 font-normal">(원/톤)</span></label>
                  <input
                    type="number"
                    className="input"
                    value={form.sell_price}
                    onChange={e => setForm(f => ({ ...f, sell_price: e.target.value }))}
                    placeholder="예: 1,850,000"
                    step="100"
                  />
                  <p className="mt-1 text-xs text-gray-400">동국제강 / 현대제철 납품 단가</p>
                </div>
                <div>
                  <label className="label">원가단가 * <span className="text-gray-400 font-normal">(원/톤)</span></label>
                  <input
                    type="number"
                    className="input"
                    value={form.cost_price}
                    onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
                    placeholder="예: 1,800,000"
                    step="100"
                  />
                  <p className="mt-1 text-xs text-gray-400">화림 / 렘코 / 동창 매입 단가</p>
                </div>
              </>
            )}

            {/* ── FeSi 단가 (USD 판매 + USD 원가 + 환율) ── */}
            {isUsd && (
              <>
                <div>
                  <label className="label">
                    판매단가 * <span className="text-gray-400 font-normal">(USD/톤)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      className="input pr-16"
                      value={form.sell_price}
                      onChange={e => setForm(f => ({ ...f, sell_price: e.target.value }))}
                      placeholder="예: 1,450.00"
                      step="0.01"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">USD/톤</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">동국제강 납품 단가 (USD)</p>
                </div>

                <div>
                  <label className="label">
                    원가단가 * <span className="text-gray-400 font-normal">(USD/톤)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      className="input pr-16"
                      value={form.cost_price}
                      onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
                      placeholder="예: 1,250.00"
                      step="0.01"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">USD/톤</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">EG 매입 단가 (USD)</p>
                </div>

                <div>
                  <label className="label">
                    참고 환율 * <span className="text-gray-400 font-normal">(원/USD)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      className="input pr-16"
                      value={form.reference_exchange_rate}
                      onChange={e => setForm(f => ({ ...f, reference_exchange_rate: e.target.value }))}
                      placeholder="예: 1,350"
                      step="1"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원/USD</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">계약 시점 참고값 (실제 정산: BL 날짜 기준 환율)</p>
                </div>

                <div>
                  <label className="label">환율 기준 설명</label>
                  <input
                    className="input"
                    value={form.exchange_rate_basis}
                    onChange={e => setForm(f => ({ ...f, exchange_rate_basis: e.target.value }))}
                    placeholder="예: BL 날짜 기준 동국제강 지정 환율"
                  />
                </div>
              </>
            )}

            {/* 메모 */}
            <div className="md:col-span-2">
              <label className="label">메모</label>
              <input
                className="input"
                value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="선택 사항"
              />
            </div>
          </div>

          {/* 마진 미리보기 */}
          {marginPreview && form.product_id && (
            <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 p-4">
              <p className="text-xs font-semibold text-blue-700 mb-3">마진 단가 미리보기</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">판매단가</p>
                  {isUsd && marginPreview.sellKrw != null ? (
                    <p className="font-semibold">
                      {fmtNum(parseFloat(form.sell_price), 2)} USD/톤
                      <br />
                      <span className="text-gray-400 text-xs">
                        ≈ {fmtNum(marginPreview.sellKrw)} 원/톤
                      </span>
                    </p>
                  ) : (
                    <p className="font-semibold">{fmtNum(parseFloat(form.sell_price))} 원/톤</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">원가단가</p>
                  {isUsd && marginPreview.costKrw != null ? (
                    <p className="font-semibold">
                      {fmtNum(parseFloat(form.cost_price), 2)} USD/톤
                      <br />
                      <span className="text-gray-400 text-xs">
                        ≈ {fmtNum(marginPreview.costKrw)} 원/톤
                      </span>
                    </p>
                  ) : (
                    <p className="font-semibold">{fmtNum(parseFloat(form.cost_price))} 원/톤</p>
                  )}
                </div>
                {isUsd && marginPreview.rate && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">참고 환율</p>
                    <p className="font-semibold">{fmtNum(marginPreview.rate)} 원/USD</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">마진 단가</p>
                  {isUsd && marginPreview.marginUsd != null ? (
                    <p className={`font-bold ${marginPreview.margin >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                      {fmtNum(marginPreview.marginUsd, 2)} USD/톤
                      <br />
                      <span className="text-lg">
                        {fmtNum(marginPreview.margin)} 원/톤
                      </span>
                    </p>
                  ) : (
                    <p className={`text-lg font-bold ${marginPreview.margin >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                      {fmtNum(marginPreview.margin)} 원/톤
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-blue-100 grid grid-cols-3 gap-2 text-xs text-gray-600">
                <div>한국에이원: <span className="font-medium text-green-700">{fmtNum(Math.floor(marginPreview.margin / 3))} 원/톤</span></div>
                <div>금화: <span className="font-medium text-purple-700">{fmtNum(Math.floor(marginPreview.margin / 3))} 원/톤</span></div>
                <div>라성: <span className="font-medium text-orange-700">{fmtNum(marginPreview.margin - Math.floor(marginPreview.margin / 3) * 2)} 원/톤</span></div>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <div className="mt-5 flex gap-2">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : editId ? '수정 저장' : '등록'}
            </button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setError('') }}>
              취소
            </button>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600 font-medium">품목 필터:</label>
        <select
          className="input w-auto"
          value={filterProductId}
          onChange={e => setFilterProductId(e.target.value)}
        >
          <option value="">전체</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.display_name}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{filtered.length}건</span>
      </div>

      {/* ── 목록 ── */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th">품목</th>
              <th className="table-th">낙찰 기간</th>
              <th className="table-th text-right">판매단가</th>
              <th className="table-th text-right">원가단가</th>
              <th className="table-th text-right">참고 환율</th>
              <th className="table-th text-right">마진 단가</th>
              <th className="table-th text-center">상태</th>
              <th className="table-th">메모</th>
              <th className="table-th">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="table-td text-center text-gray-400 py-10">
                  등록된 낙찰 단가가 없습니다.
                </td>
              </tr>
            )}
            {filtered.map(c => {
              const usd = c.currency === 'USD'
              const marginPerTon = usd && c.reference_exchange_rate
                ? fesiMarginPerTon(c.sell_price, c.cost_price, c.reference_exchange_rate)
                : c.sell_price - c.cost_price

              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  {/* 품목 */}
                  <td className="table-td">
                    <span className="font-medium">{c.product?.display_name}</span>
                    {usd && (
                      <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1 rounded">USD</span>
                    )}
                  </td>

                  {/* 기간 */}
                  <td className="table-td text-gray-600 whitespace-nowrap">
                    {c.start_date.slice(0, 10)} ~<br />
                    <span className="text-gray-500">{c.end_date.slice(0, 10)}</span>
                  </td>

                  {/* 판매단가 */}
                  <td className="table-td text-right whitespace-nowrap">
                    {usd ? (
                      <>
                        {fmtNum(c.sell_price, 2)}<span className="text-gray-400 text-xs ml-0.5">USD/톤</span>
                        {c.reference_exchange_rate && (
                          <div className="text-xs text-gray-400">
                            ≈ {fmtNum(c.sell_price * c.reference_exchange_rate)}원
                          </div>
                        )}
                      </>
                    ) : (
                      <>{fmtNum(c.sell_price)}<span className="text-gray-400 text-xs ml-0.5">원/톤</span></>
                    )}
                  </td>

                  {/* 원가단가 */}
                  <td className="table-td text-right whitespace-nowrap">
                    {usd ? (
                      <>
                        {fmtNum(c.cost_price, 2)}<span className="text-gray-400 text-xs ml-0.5">USD/톤</span>
                        {c.reference_exchange_rate && (
                          <div className="text-xs text-gray-400">
                            ≈ {fmtNum(c.cost_price * c.reference_exchange_rate)}원
                          </div>
                        )}
                      </>
                    ) : (
                      <>{fmtNum(c.cost_price)}<span className="text-gray-400 text-xs ml-0.5">원/톤</span></>
                    )}
                  </td>

                  {/* 참고 환율 */}
                  <td className="table-td text-right text-gray-500">
                    {usd && c.reference_exchange_rate
                      ? <>{fmtNum(c.reference_exchange_rate)}<span className="text-xs ml-0.5">원</span></>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>

                  {/* 마진 단가 */}
                  <td className={`table-td text-right font-semibold whitespace-nowrap ${marginPerTon >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {fmtNum(marginPerTon)}<span className="text-xs font-normal ml-0.5">원/톤</span>
                    {usd && !c.reference_exchange_rate && (
                      <div className="text-xs text-yellow-600 font-normal">환율 필요</div>
                    )}
                  </td>

                  {/* 상태 */}
                  <td className="table-td text-center">{statusBadge(c)}</td>

                  {/* 메모 */}
                  <td className="table-td text-xs text-gray-400 max-w-[120px] truncate">
                    {c.memo ?? '—'}
                  </td>

                  {/* 관리 */}
                  <td className="table-td whitespace-nowrap">
                    <button
                      className="text-xs text-blue-600 hover:underline mr-2"
                      onClick={() => openEdit(c)}
                    >수정</button>
                    <button
                      className="text-xs text-red-500 hover:underline"
                      onClick={() => handleDelete(c.id)}
                    >삭제</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="mt-3 flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> 적용 중: 오늘이 낙찰 기간 내
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> 예정: 낙찰 기간 시작 전
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> 종료: 낙찰 기간 만료
        </span>
      </div>
    </div>
  )
}
