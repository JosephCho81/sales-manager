/**
 * 계산서 발행 지시 자동 생성 — 메인 진입점
 *
 * 품목별 라우팅:
 *   AL35B / AL65B → al-series.ts
 *   SOGGAE (소괴탄) → coal.ts
 *   BUNTAN (분탄)   → coal.ts
 *   FESI75 / FESI60 → fesi.ts (입고 건별)
 *   AL30            → al30.ts
 */
import { genALSeries } from './al-series'
import { genSoggae, genBuntan } from './coal'
import { genFeSi } from './fesi'
import { genAL30 } from './al30'
import type { DeliveryForInvoice, InvoiceToCreate } from './types'

export type { DeliveryForInvoice, InvoiceToCreate, InvoiceType, InvoiceRow } from './types'
export type { DeliveryRawForInvoice, FxRateRaw } from './mapper'
export { mapDeliveries } from './mapper'

export function generateInvoices(
  deliveries: DeliveryForInvoice[],
  yearMonth: string,
): InvoiceToCreate[] {
  if (deliveries.length === 0) return []

  // 품목별 그룹화
  const byProduct = new Map<string, DeliveryForInvoice[]>()
  for (const d of deliveries) {
    const list = byProduct.get(d.product_name) ?? []
    list.push(d)
    byProduct.set(d.product_name, list)
  }

  const result: InvoiceToCreate[] = []

  for (const [productName, group] of byProduct) {
    const name = productName.toUpperCase()

    if (name === 'AL35B' || name === 'AL65B') {
      result.push(...genALSeries(group, yearMonth))
    } else if (name === 'SOGGAE') {
      result.push(...genSoggae(group, yearMonth))
    } else if (name === 'BUNTAN') {
      result.push(...genBuntan(group, yearMonth))
    } else if (name === 'FESI75' || name === 'FESI60') {
      for (const d of group) result.push(...genFeSi(d, yearMonth))
    } else if (name === 'AL30') {
      result.push(...genAL30(group, yearMonth))
    }
  }

  return result
}
