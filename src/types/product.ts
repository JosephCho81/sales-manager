export type PriceUnit = 'KRW_TON' | 'USD_TON' | 'KRW_KG'
export type VatType = 'NONE' | 'TEN_PERCENT'

export interface ChainInfo {
  steps: string[]
  buy_from: string
  sell_to: string
  special?: string
}

export interface Product {
  id: string
  name: string
  display_name: string
  buyer: string
  unit: string
  price_unit: PriceUnit
  vat: VatType
  chain: ChainInfo
  memo: string | null
  is_active: boolean
  created_at: string
}
