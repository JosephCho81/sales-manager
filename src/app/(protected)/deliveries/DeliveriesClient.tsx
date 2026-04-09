'use client'

import { useState } from 'react'
import { getCurrentYearMonth } from '@/lib/date'
import DeliveryForm from './DeliveryForm'
import DeliveryTable from './DeliveryTable'
import type { ProductRow, ContractRow, DeliveryRow } from './types'

export default function DeliveriesClient({
  products,
  contracts,
  initialDeliveries,
}: {
  products: ProductRow[]
  contracts: ContractRow[]
  initialDeliveries: DeliveryRow[]
}) {
  const [deliveries, setDeliveries]   = useState<DeliveryRow[]>(initialDeliveries)
  const [filterMonth, setFilterMonth] = useState(getCurrentYearMonth())
  // undefined = 폼 숨김 | null = 새 입고 | DeliveryRow = 수정 중
  const [editDelivery, setEditDelivery] = useState<DeliveryRow | null | undefined>(undefined)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">입고 입력</h2>
          <p className="text-sm text-gray-500 mt-0.5">물량 입력 → 마진 자동 계산 (1/3 배분)</p>
        </div>
        <button className="btn-primary" onClick={() => setEditDelivery(null)}>+ 입고 입력</button>
      </div>

      {editDelivery !== undefined && (
        <DeliveryForm
          products={products}
          contracts={contracts}
          editDelivery={editDelivery}
          defaultYearMonth={filterMonth}
          onClose={() => setEditDelivery(undefined)}
          onSaved={saved => {
            setDeliveries(prev =>
              editDelivery?.id
                ? prev.map(d => d.id === editDelivery.id ? saved : d)
                : [saved, ...prev]
            )
            setEditDelivery(undefined)
          }}
        />
      )}

      <DeliveryTable
        deliveries={deliveries}
        filterMonth={filterMonth}
        onFilterChange={setFilterMonth}
        onEdit={d => setEditDelivery(d)}
        onDeleted={id => setDeliveries(prev => prev.filter(d => d.id !== id))}
      />
    </div>
  )
}
