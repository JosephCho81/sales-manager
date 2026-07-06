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
export { needsInvoiceRegen } from './regen-check'

// 지급일정 표시 순서: AL35B → 소괴탄 → 분탄 → AL40 → AL30 → FeSi
// AL40 제품명은 DB에서 'AL40고품위알믹스'로 저장됨 — startsWith('AL40')로 비교
const PRODUCT_ORDER = ['AL35B', 'AL65B', 'SOGGAE', 'BUNTAN', 'AL40고품위알믹스', 'AL30', 'FESI75', 'FESI60']

export { PRODUCT_ORDER }

/** 월별 감가 입력 — year_month는 납품월 기준 */
export type MonthlyDepInput = { product_id: string; year_month: string; amount: number }

export function generateInvoices(
  deliveries: DeliveryForInvoice[],
  yearMonth: string,
  monthlyDeps: MonthlyDepInput[] = [],
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
      // genBuntan은 group[0].year_month를 납품월로 사용 — 감가도 동일 기준 매칭
      const dep = monthlyDeps
        .filter(md => md.product_id === group[0].product_id && md.year_month === group[0].year_month)
        .reduce((s, md) => s + Number(md.amount), 0)
      result.push(...genBuntan(group, yearMonth, dep))
    } else if (name.startsWith('AL40') || name === 'AL30') {
      result.push(...genAL30(group, yearMonth))
    } else if (name === 'FESI75' || name === 'FESI60') {
      for (const d of group) result.push(...genFeSi(d, yearMonth))
    }
  }

  return result
}
