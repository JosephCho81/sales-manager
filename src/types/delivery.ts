import type { DeliveryProduct, DeliveryContract } from './contract'

export interface Delivery {
  id: string
  year_month: string
  invoice_month: string | null
  delivery_date: string | null
  product_id: string
  contract_id: string
  quantity_kg: number
  depreciation_amount: number | null
  memo: string | null
  created_at: string
  product?: DeliveryProduct | null
  contract?: DeliveryContract | null
}

export interface FxRate {
  id: string
  bl_date: string
  product_id: string
  rate_krw_per_usd: number
  memo: string | null
  created_at: string
}
