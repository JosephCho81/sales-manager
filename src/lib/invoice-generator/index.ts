/**
 * 계산서 발행 지시 자동 생성 — 메인 진입점
 *
 * 품목별 라우팅 (표시 순서):
 *   AL35B / AL65B → al-series.ts
 *   SOGGAE (소괴탄) → coal.ts
 *   BUNTAN (분탄)   → coal.ts
 *   AL40 / AL30     → al30.ts
 *   FESI75 / FESI60 → fesi.ts (입고 건별)
 */
import { genALSeries } from './al-series'
import { genSoggae, genBuntan } from './coal'
import { genFeSi } from './fesi'
import { genAL30 } from './al30'
import type { DeliveryForInvoice, InvoiceToCreate } from './types'

export type { DeliveryForInvoice, InvoiceToCreate, InvoiceType, InvoiceRow } from './types'
export type { DeliveryRawForInvoice, FxRateRaw } from './mapper'
export { mapDeliveries } from './mapper'
export type { CommissionForInvoice } from './commission'
export { generateCommissionInvoices } from './commission'

// 지급일정 표시 순서: AL35B → 소괴탄 → 분탄 → AL40 → AL30 → FeSi
const PRODUCT_ORDER = ['AL35B', 'AL65B', 'SOGGAE', 'BUNTAN', 'AL40', 'AL30', 'FESI75', 'FESI60']

export { PRODUCT_ORDER }

export function generateInvoices(
  deliveries: DeliveryForInvoice[],
  yearMonth: string,
): InvoiceToCreate[] {
  if (deliveries.length === 0) return []

  // 품목별 그룹화 (대문자 정규화)
  const byProduct = new Map<string, DeliveryForInvoice[]>()
  for (const d of deliveries) {
    const key = d.product_name.toUpperCase()
    const list = byProduct.get(key) ?? []
    list.push(d)
    byProduct.set(key, list)
  }

  const result: InvoiceToCreate[] = []

  for (const name of PRODUCT_ORDER) {
    const group = byProduct.get(name)
    if (!group) continue

    if (name === 'AL35B' || name === 'AL65B') {
      result.push(...genALSeries(group, yearMonth))
    } else if (name === 'SOGGAE') {
      result.push(...genSoggae(group, yearMonth))
    } else if (name === 'BUNTAN') {
      result.push(...genBuntan(group, yearMonth))
    } else if (name === 'AL40' || name === 'AL30') {
      result.push(...genAL30(group, yearMonth))
    } else if (name === 'FESI75' || name === 'FESI60') {
      for (const d of group) result.push(...genFeSi(d, yearMonth))
    }
  }

  return result
}
