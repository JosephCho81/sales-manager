'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCanEdit } from '@/components/RoleProvider'
import { HOMETAX_COMPANY_NAMES, isValidBizNo, type CompanyInfo } from '@/lib/hometax'
import { saveCompany } from './company-actions'

const FIELDS: Array<{ key: Exclude<keyof CompanyInfo, 'name'>; label: string; placeholder?: string }> = [
  { key: 'biz_no', label: '사업자등록번호', placeholder: '숫자 10자리' },
  { key: 'trade_name', label: '상호', placeholder: '계산서에 찍히는 정식 상호' },
  { key: 'ceo_name', label: '대표자 성명' },
  { key: 'address', label: '사업장 주소' },
  { key: 'biz_type', label: '업태' },
  { key: 'biz_item', label: '종목' },
  { key: 'email', label: '이메일', placeholder: '계산서 받을 주소' },
]

function empty(name: string): CompanyInfo {
  return { name, biz_no: '', trade_name: '', ceo_name: '', address: '', biz_type: '', biz_item: '', email: '' }
}

/**
 * 거래처 사업자정보 — 홈택스 엑셀 일괄발급 파일의 공급자·공급받는자 칸.
 * 사업자등록증 그대로 한 번 입력해 두면 매달 다시 입력하지 않는다.
 */
export default function CompanyPanel({ companies }: { companies: CompanyInfo[] }) {
  const router = useRouter()
  const canEdit = useCanEdit()
  const byName = new Map(companies.map(c => [c.name, c]))
  const [editing, setEditing] = useState<CompanyInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!editing) return
    setBusy(true)
    setError(null)
    const res = await saveCompany(editing)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    setEditing(null)
    router.refresh()
  }

  return (
    <div className="card p-5 mt-8">
      <h3 className="text-base font-bold text-gray-800">거래처 사업자정보</h3>
      <p className="text-xs text-gray-500 mt-1">
        지급 일정의 <b>홈택스 엑셀</b> 파일에 들어갑니다. 사업자등록증 그대로 한 번만 입력하면 됩니다.
      </p>

      <ul className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded">
        {HOMETAX_COMPANY_NAMES.map(name => {
          const c = byName.get(name)
          return (
            <li key={name} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-28 font-medium text-gray-700">{name}</span>
              <span className="flex-1 text-xs text-gray-500 truncate">
                {c ? `${c.biz_no.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3')} · ${c.trade_name} · ${c.ceo_name}` : <span className="text-amber-600">미입력</span>}
              </span>
              {canEdit && (
                <button className="text-xs text-blue-600 hover:underline"
                  onClick={() => { setError(null); setEditing(c ?? empty(name)) }}>
                  {c ? '수정' : '입력'}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {editing && (
        <div className="mt-4 rounded border border-gray-200 p-4">
          <p className="text-sm font-bold text-gray-700 mb-3">{editing.name}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                <input
                  value={editing[f.key]}
                  placeholder={f.placeholder}
                  onChange={e => setEditing({ ...editing, [f.key]: e.target.value })}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full"
                />
                {f.key === 'biz_no' && editing.biz_no && !isValidBizNo(editing.biz_no.replace(/\D/g, '')) && (
                  <p className="text-xs text-red-500 mt-0.5">번호를 다시 확인하세요</p>
                )}
              </div>
            ))}
          </div>
          {error && <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button className="btn-primary text-xs disabled:opacity-40" disabled={busy} onClick={handleSave}>
              {busy ? '저장 중…' : '저장'}
            </button>
            <button className="btn-secondary text-xs" onClick={() => setEditing(null)}>취소</button>
          </div>
        </div>
      )}
    </div>
  )
}
