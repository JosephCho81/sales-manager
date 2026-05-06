/**
 * 변동 분석: 현재 기간 vs 이전 기간 ProductRow 비교
 */
import { fmtNum } from '@/lib/margin'
import { shiftMonths } from '@/lib/date'
import type { ProductRow, ProductChange, ChangeAnalysisResult } from './analytics-types'

export type { ProductChange, ChangeAnalysisResult }

/** fromYM~toYM에 해당하는 비교 기간 산출 */
export function calcPrevPeriod(
  fromYM: string,
  toYM: string,
  mode: 'month' | 'range' | 'year',
): { prevFromYM: string; prevToYM: string } {
  if (mode === 'year') {
    const y = parseInt(fromYM.slice(0, 4)) - 1
    return { prevFromYM: `${y}-01`, prevToYM: `${y}-12` }
  }
  const [fy, fm] = fromYM.split('-').map(Number)
  const [ty, tm] = toYM.split('-').map(Number)
  const n = (ty - fy) * 12 + (tm - fm) + 1
  return { prevFromYM: shiftMonths(fromYM, -n), prevToYM: shiftMonths(toYM, -n) }
}

type AggRow = {
  productId: string; name: string; displayName: string; buyer: string
  qtyTon: number; totalMargin: number; a1: number; sellPricePerTon: number | null
}

function aggregateRows(rows: ProductRow[]): Map<string, AggRow> {
  const map = new Map<string, AggRow>()
  for (const r of rows) {
    const k = `${r.name}_${r.buyer}`
    const ex = map.get(k)
    if (ex) {
      ex.qtyTon      += r.qtyTon
      ex.totalMargin += r.totalMargin
      ex.a1          += r.a1
      if (ex.sellPricePerTon !== null && ex.sellPricePerTon !== r.sellPricePerTon) {
        ex.sellPricePerTon = null
      }
    } else {
      map.set(k, {
        productId: r.productId, name: r.name, displayName: r.displayName, buyer: r.buyer,
        qtyTon: r.qtyTon, totalMargin: r.totalMargin, a1: r.a1,
        sellPricePerTon: r.sellPricePerTon,
      })
    }
  }
  return map
}

function buildCauseText(
  curQty: number, prevQty: number,
  qtyChanged: boolean, priceChanged: boolean,
  curPrice: number | null, prevPrice: number | null,
): string {
  if (curQty === 0) return '해당 기간 납품 없음'
  if (prevQty === 0) return '신규 거래 시작'
  if (qtyChanged && priceChanged) return '물량 + 단가 동시 변동'
  if (qtyChanged) return `물량 변동 (${fmtNum(prevQty, 1)}톤 → ${fmtNum(curQty, 1)}톤)`
  if (priceChanged && curPrice !== null && prevPrice !== null) {
    return `단가 변경 (${fmtNum(prevPrice, 0)} → ${fmtNum(curPrice, 0)}원/톤)`
  }
  return '변동 없음'
}

import { PRODUCT_ORDER } from './analytics-types'

export function buildChangeAnalysis(
  curRows: ProductRow[],
  prevRows: ProductRow[],
  hasPrevData: boolean,
  prevFromYM: string,
  prevToYM: string,
): ChangeAnalysisResult {
  const cur  = aggregateRows(curRows)
  const prev = aggregateRows(prevRows)
  const allKeys = new Set([...cur.keys(), ...prev.keys()])
  const changes: ProductChange[] = []

  for (const k of allKeys) {
    const c = cur.get(k)
    const p = prev.get(k)

    const curQtyTon     = c?.qtyTon      ?? 0
    const curMargin     = c?.totalMargin ?? 0
    const curA1         = c?.a1          ?? 0
    const curSellPrice  = c?.sellPricePerTon ?? null
    const prevQtyTon    = p?.qtyTon      ?? 0
    const prevMargin    = p?.totalMargin ?? 0
    const prevA1        = p?.a1          ?? 0
    const prevSellPrice = p?.sellPricePerTon ?? null

    const qtyDelta    = curQtyTon - prevQtyTon
    const marginDelta = curMargin - prevMargin
    const qtyPct      = prevQtyTon !== 0 ? (qtyDelta / prevQtyTon) * 100 : null
    const marginPct   = prevMargin !== 0 ? (marginDelta / prevMargin) * 100 : null

    const qtyChanged   = Math.abs(qtyDelta) >= 0.001
    const priceChanged = curSellPrice !== null && prevSellPrice !== null && curSellPrice !== prevSellPrice

    const curRatio  = curMargin  !== 0 ? curA1  / curMargin  : null
    const prevRatio = prevMargin !== 0 ? prevA1 / prevMargin : null
    const distributionChanged = curRatio !== null && prevRatio !== null &&
      Math.abs(curRatio - prevRatio) > 0.01

    const isNew = !p && !!c
    const ref = c ?? p!

    changes.push({
      productId: ref.productId, name: ref.name, displayName: ref.displayName, buyer: ref.buyer,
      curQtyTon, curMargin, curSellPrice,
      prevQtyTon, prevMargin, prevSellPrice,
      qtyDelta, qtyPct, marginDelta, marginPct,
      priceChanged, distributionChanged, isNew,
      causeText: buildCauseText(curQtyTon, prevQtyTon, qtyChanged, priceChanged, curSellPrice, prevSellPrice),
    })
  }

  changes.sort((a, b) => {
    const ai = PRODUCT_ORDER.indexOf(a.name), bi = PRODUCT_ORDER.indexOf(b.name)
    const ord = (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    return ord !== 0 ? ord : a.buyer.localeCompare(b.buyer)
  })

  return { changes, hasPrevData, prevFromYM, prevToYM }
}
