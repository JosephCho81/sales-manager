'use client'

import { useState } from 'react'
import ContractForm from './ContractForm'
import ContractTable from './ContractTable'
import type { Product } from '@/types'
import type { ContractRow } from './types'

// ────────────────────────────────────────────────────────
// ContractsClient — 얇은 코디네이터
//   상태: contracts 목록, filterProductId, showForm, editContract
//   ContractForm: 폼 렌더 + 저장 로직
//   ContractTable: 테이블 렌더 + 삭제 로직
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
  const [editContract, setEditContract] = useState<ContractRow | null | undefined>(undefined)
  // undefined = form hidden, null = new, ContractRow = editing

  function openNew() {
    setEditContract(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openEdit(c: ContractRow) {
    setEditContract(c)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeForm() {
    setEditContract(undefined)
  }

  function handleSaved(saved: ContractRow) {
    setContracts(prev =>
      editContract
        ? prev.map(c => c.id === saved.id ? saved : c)
        : [saved, ...prev]
    )
    setEditContract(undefined)
  }

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

      {editContract !== undefined && (
        <ContractForm
          products={products}
          editContract={editContract}
          existingContracts={contracts}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}

      <ContractTable
        contracts={contracts}
        products={products}
        filterProductId={filterProductId}
        onFilterChange={setFilterProductId}
        onEdit={openEdit}
        onDeleted={id => setContracts(prev => prev.filter(c => c.id !== id))}
      />
    </div>
  )
}
