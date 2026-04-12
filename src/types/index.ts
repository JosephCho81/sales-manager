// ────────────────────────────────────────────────────────
// 품목 (Products)
// ────────────────────────────────────────────────────────
export type PriceUnit = 'KRW_TON' | 'USD_TON' | 'KRW_KG'
export type Currency = 'KRW' | 'USD'
export type VatType = 'NONE' | 'TEN_PERCENT'

export interface Product {
  id: string
  name: string            // 내부 코드명 (예: AL35B)
  display_name: string    // 화면 표시명 (예: AL-35B)
  buyer: string           // 납품처 (예: 동국제강)
  unit: string            // 단위 (예: kg, ton)
  price_unit: PriceUnit   // 단가 기준
  vat: VatType
  chain: ChainInfo        // 거래 체인 jsonb
  memo: string | null
  is_active: boolean
  created_at: string
}

export interface ChainInfo {
  steps: string[]          // 예: ['동국제강', '한국에이원', '금화', '화림']
  buy_from: string         // 매입처
  sell_to: string          // 납품처
  special?: string         // 특이사항 (예: 'hyundai', 'ferrosilicon', 'hoejin')
}

// ────────────────────────────────────────────────────────
// 납품 건 join 결과 타입 (select에 따라 일부 필드만 포함)
// ────────────────────────────────────────────────────────
export interface DeliveryProduct {
  id: string
  name: string
  display_name: string
  buyer: string
}

export interface DeliveryContract {
  id: string
  sell_price: number
  cost_price: number
  currency: Currency
  reference_exchange_rate: number | null
  start_date?: string
  end_date?: string
}

// ────────────────────────────────────────────────────────
// 낙찰 단가 계약 (Contracts)
// ────────────────────────────────────────────────────────
export interface Contract {
  id: string
  product_id: string
  start_date: string       // YYYY-MM-DD
  end_date: string         // YYYY-MM-DD
  sell_price: number       // 판매단가 — KRW 품목: 원/톤, FeSi: 원/톤(동국 납품가)
  cost_price: number       // 원가단가 — KRW 품목: 원/톤, FeSi: USD/톤(EG 매입가)
  currency: Currency       // KRW or USD (USD = FeSi, cost_price가 USD)
  exchange_rate_basis: string | null   // 환율 기준 설명 (텍스트)
  reference_exchange_rate: number | null  // FeSi 참고 환율 (원/USD)
  memo: string | null
  created_at: string
  product?: DeliveryProduct | null
}

// ────────────────────────────────────────────────────────
// 납품 건 (Deliveries)
// ────────────────────────────────────────────────────────
export interface Delivery {
  id: string
  year_month: string         // YYYY-MM (예: 2024-03)
  invoice_month: string | null  // 지급 스케줄 월 (집계 기준)
  delivery_date: string | null  // 실제 납품일
  product_id: string
  contract_id: string
  quantity_kg: number        // 기본 납품 물량 (kg)
  depreciation_amount: number | null
  memo: string | null
  created_at: string
  // join (선택적 — partial 포함 가능)
  product?: DeliveryProduct | null
  contract?: DeliveryContract | null
}

// ────────────────────────────────────────────────────────
// 환율 (FX Rates - 페로실리콘용)
// ────────────────────────────────────────────────────────
export interface FxRate {
  id: string
  bl_date: string          // BL 날짜
  product_id: string
  rate_krw_per_usd: number
  memo: string | null
  created_at: string
}

// ────────────────────────────────────────────────────────
// 마진 계산 결과
// ────────────────────────────────────────────────────────
export interface MarginResult {
  quantity_ton: number
  sell_price: number
  cost_price: number
  total_margin: number
  korea_a1: number        // 한국에이원
  geumhwa: number         // 금화
  raseong: number         // 라성 (나머지)
}

// ────────────────────────────────────────────────────────
// Supabase DB 타입 (raw rows)
// ────────────────────────────────────────────────────────
export type Database = {
  public: {
    Tables: {
      products: {
        Row: Product
        Insert: Omit<Product, 'id' | 'created_at'>
        Update: Partial<Omit<Product, 'id' | 'created_at'>>
      }
      contracts: {
        Row: Contract
        Insert: Omit<Contract, 'id' | 'created_at'>
        Update: Partial<Omit<Contract, 'id' | 'created_at'>>
      }
      deliveries: {
        Row: Delivery
        Insert: Omit<Delivery, 'id' | 'created_at'>
        Update: Partial<Omit<Delivery, 'id' | 'created_at'>>
      }
      fx_rates: {
        Row: FxRate
        Insert: Omit<FxRate, 'id' | 'created_at'>
        Update: Partial<Omit<FxRate, 'id' | 'created_at'>>
      }
    }
  }
}
