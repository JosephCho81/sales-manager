export type Currency = 'KRW' | 'USD'

// 납품 건 join 시 포함되는 product 부분 타입
export interface DeliveryProduct {
  id: string
  name: string
  display_name: string
  buyer: string
}

// 납품 건 join 시 포함되는 contract 부분 타입
export interface DeliveryContract {
  id: string
  sell_price: number
  cost_price: number
  currency: Currency
  reference_exchange_rate: number | null
  start_date?: string
  end_date?: string
}

export interface Contract {
  id: string
  product_id: string
  start_date: string
  end_date: string
  sell_price: number
  cost_price: number
  currency: Currency
  exchange_rate_basis: string | null
  reference_exchange_rate: number | null
  memo: string | null
  created_at: string
  product?: DeliveryProduct | null
}
