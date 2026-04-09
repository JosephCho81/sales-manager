/**
 * 계산서 발행 지시 자동 생성 — 메인 진입점
 * 품목명으로 라우팅하여 각 품목별 파일에서 처리한다.
 *
 * 품목별 로직 위치:
 *   AL35B / AL65B → al-series.ts
 *   소괴탄 (SOGGAE) → coal.ts
 *   분탄   (BUNTAN) → coal.ts
 *   FeSi75 / FeSi60 → fesi.ts
 *   AL30  (현대제철) → al30.ts
 */
import { genALSeries } from './al-series'
import { genSoggae, genBuntan } from './coal'
import { genFeSi } from './fesi'
import { genAL30 } from './al30'
import type { DeliveryForInvoice, InvoiceToCreate } from './types'

export type { DeliveryForInvoice, InvoiceToCreate }
export type { InvoiceType } from './types'

export function generateInvoices(
  deliveries: DeliveryForInvoice[],
  yearMonth: string,
): InvoiceToCreate[] {
  if (deliveries.length === 0) return []

  const result: InvoiceToCreate[] = []

  // 품목별 그룹화
  const byProduct = new Map<string, DeliveryForInvoice[]>()
  for (const d of deliveries) {
    const list = byProduct.get(d.product_name) ?? []
    list.push(d)
    byProduct.set(d.product_name, list)
  }

  for (const [productName, group] of byProduct) {
    const name = productName.toUpperCase()

    if (name === 'AL35B' || name === 'AL65B') {
      result.push(...genALSeries(group, yearMonth))
    } else if (name === 'SOGGAE') {
      result.push(...genSoggae(group, yearMonth))
    } else if (name === 'BUNTAN') {
      result.push(...genBuntan(group, yearMonth))
    } else if (name === 'FESI75' || name === 'FESI60') {
      for (const d of group) {
        result.push(...genFeSi(d, yearMonth))
      }
    } else if (name === 'AL30') {
      result.push(...genAL30(group, yearMonth))
    }
  }

  return result
}
