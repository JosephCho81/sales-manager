export type FeSiProduct = { id: string; name: string; display_name: string }

export type FxRateRow = {
  id: string
  bl_date: string
  product_id: string
  rate_krw_per_usd: number
  memo: string | null
  created_at: string
}

export type FeSiDeliveryRow = {
  id: string
  year_month: string
  delivery_date: string | null
  product_id: string
  quantity_kg: number
  memo: string | null
  product: { id: string; name: string; display_name: string } | null
  contract: {
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
  } | null
}

export type DeliveryDetail = {
  id: string
  blDate: string
  qtyTon: number
  sellKrw: number
  costUsd: number
  costKrw: number
  marginKrw: number
  rateUsed: number
  rateSource: string
  refRate: number | null
  actualRate: number | null
  receiveDeadline: string
  egPayDeadline: string
  memo: string | null
  product: { id: string; name: string; display_name: string } | null
}
