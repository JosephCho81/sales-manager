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

/**
 * 월별 감가 입력 — year_month는 감가가 발생한 납품월(귀속월).
 * 매입 계산서에서 실제로 차감하는 달은 cost_deduct_ym (미지정 시 year_month = 당월 차감).
 * 분탄은 당월 차감이라 둘이 같고, AL30은 회수 합의에 따라 몇 달 뒤가 된다.
 */
export type MonthlyDepInput = {
  product_id: string
  year_month: string
  amount: number
  /** 매출 계산서가 감액 발행된 납품월. null = 매출 영향 없음(보관형) */
  sales_deduct_ym?: string | null
  cost_deduct_ym?: string | null
  /** 감가 반영 매입 계산서의 실제 부가세(실물 세금계산서 값). null = 계산값 사용 */
  cost_vat_actual?: number | null
}

function slice(
  deps: MonthlyDepInput[],
  match: (md: MonthlyDepInput) => boolean,
): { amount: number; originYMs: string[] } {
  const hit = deps.filter(match)
  return {
    amount: hit.reduce((s, md) => s + Number(md.amount), 0),
    originYMs: Array.from(new Set(hit.map(md => md.year_month))).sort(),
  }
}

/**
 * 특정 품목·납품월 매입 계산서에서 차감할 감가 합계 + 귀속월 목록.
 *
 * `vatActual`은 계산서 한 장의 부가세 총액이므로 합산할 수 없다. 같은 달에 차감되는
 * 감가가 여러 건인데 둘 이상이 값을 갖고 있으면 어느 쪽이 그 장의 실제 세액인지
 * 결정할 수 없으므로 계산값으로 되돌린다 (임의로 하나를 고르면 조용히 틀린다).
 */
function costDepFor(deps: MonthlyDepInput[], productId: string, deliveryYM: string) {
  const match = (md: MonthlyDepInput) =>
    md.product_id === productId && (md.cost_deduct_ym ?? md.year_month) === deliveryYM
  const declared = deps
    .filter(md => match(md) && md.cost_vat_actual !== null && md.cost_vat_actual !== undefined)
    .map(md => Number(md.cost_vat_actual))
  return {
    ...slice(deps, match),
    vatActual: declared.length === 1 ? declared[0] : null,
  }
}

/** 특정 품목·납품월 매출 계산서가 감액 발행된 금액 (통과형만 해당) */
function salesDepFor(deps: MonthlyDepInput[], productId: string, deliveryYM: string) {
  return slice(deps, md => md.product_id === productId && md.sales_deduct_ym === deliveryYM)
}

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
      const dep = costDepFor(monthlyDeps, group[0].product_id, group[0].year_month)
      result.push(...genBuntan(group, yearMonth, dep.amount, dep.vatActual))
    } else if (name.startsWith('AL40') || name === 'AL30') {
      const pid = group[0].product_id
      const dym = group[0].year_month
      result.push(...genAL30(
        group, yearMonth,
        costDepFor(monthlyDeps, pid, dym),
        salesDepFor(monthlyDeps, pid, dym),
      ))
    } else if (name === 'FESI75' || name === 'FESI60') {
      for (const d of group) result.push(...genFeSi(d, yearMonth))
    }
  }

  return result
}
