'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCanEdit } from '@/components/RoleProvider'
import DeliveryForm from './DeliveryForm'
import DeliveryTable from './DeliveryTable'
import type { ProductRow, ContractRow, DeliveryRow } from './types'

export default function DeliveriesClient({
  month,
  products,
  contracts,
  initialDeliveries,
}: {
  /** 조회 월 — 서버가 이 달 입고만 내려준다 */
  month: string
  products: ProductRow[]
  contracts: ContractRow[]
  initialDeliveries: DeliveryRow[]
}) {
  const router = useRouter()
  const canEdit = useCanEdit()
  const [deliveries, setDeliveries]   = useState<DeliveryRow[]>(initialDeliveries)
  // undefined = 폼 숨김 | null = 새 입고 | DeliveryRow = 수정 중
  const [editDelivery, setEditDelivery] = useState<DeliveryRow | null | undefined>(undefined)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">입고 입력</h2>
          <p className="text-sm text-gray-500 mt-0.5">물량 입력 → 마진 자동 계산 (1/3 배분)</p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setEditDelivery(null)}>+ 입고 입력</button>
        )}
      </div>

      {canEdit && editDelivery !== undefined && (
        <DeliveryForm
          key={editDelivery?.id ?? 'new'}
          products={products}
          contracts={contracts}
          editDelivery={editDelivery}
          defaultYearMonth={month}
          onClose={() => setEditDelivery(undefined)}
          onSaved={saved => {
            // 다른 달로 저장·이동한 건은 이 달 목록에서 뺀다
            const inMonth = saved.filter(d => d.year_month === month)
            setDeliveries(prev =>
              editDelivery?.id
                ? prev.flatMap(d => d.id === editDelivery.id ? inMonth : [d])
                : [...inMonth, ...prev]
            )
            setEditDelivery(undefined)
          }}
        />
      )}

      <DeliveryTable
        deliveries={deliveries}
        filterMonth={month}
        onFilterChange={m => { if (m) router.push(`/deliveries?month=${m}`) }}
        onEdit={d => setEditDelivery(d)}
        onDeleted={id => setDeliveries(prev => prev.filter(d => d.id !== id))}
      />
    </div>
  )
}
