export interface ContractRow {
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
  product: { id: string; name: string; display_name: string; price_unit: string }
}

export interface ContractFormState {
  product_id: string
  start_date: string
  end_date: string
  sell_price: string
  cost_price: string
  reference_exchange_rate: string
  exchange_rate_basis: string
  memo: string
}
