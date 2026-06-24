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
  depreciation_amount: number | null
  memo: string | null
  created_at: string
  /** fx_rates 테이블에서 (product_id, delivery_date)로 조회한 FeSi 실제 환율. 없으면 계약 참고환율 사용 */
  fx_rate?: number | null
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
  depreciation_amount: string
  memo: string
}
