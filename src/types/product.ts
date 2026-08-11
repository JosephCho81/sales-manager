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
  /** 낙관적 잠금 기준 (019). 마이그레이션 전 데이터는 없을 수 있다 */
  updated_at?: string | null
}
