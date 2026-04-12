import type { Product } from './product'
import type { Contract } from './contract'
import type { Delivery, FxRate } from './delivery'

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
