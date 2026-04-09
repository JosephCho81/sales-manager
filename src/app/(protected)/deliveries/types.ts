export interface ProductRow {
  id: string
  name: string
  display_name: string
  buyer: string
  price_unit: string   // 'KRW_TON' | 'USD_TON'
}

export interface ContractRow {
  id: string
  product_id: string
  start_date: string
  end_date: string
  sell_price: number
  cost_price: number
  currency: 'KRW' | 'USD'
  reference_exchange_rate: number | null
  invoice_month_offset: number
}

export interface DeliveryRow {
  id: string
  year_month: string
  invoice_month: string
  delivery_date: string | null
  product_id: string
  contract_id: string
  quantity_kg: number
  addl_quantity_kg: number | null
  addl_margin_per_ton: number | null
  hoejin_shortage_kg: number | null
  hoejin_shortage_price: number | null
  depreciation_kg: number | null
  memo: string | null
  created_at: string
  product: { id: string; display_name: string; buyer: string }
  contract: {
    id: string
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
    start_date: string
    end_date: string
  }
}

export interface FormState {
  delivery_date: string
  product_id: string
  contract_id: string
  quantity_kg: string
  fesi_fx_rate: string
  use_addl: boolean
  addl_quantity_kg: string
  addl_margin_per_ton: string
  use_shortage: boolean
  hoejin_shortage_kg: string
  hoejin_shortage_price: string
  depreciation_ton: string
  memo: string
}
