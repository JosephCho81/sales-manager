import type { MarginResult } from '@/types'

// ────────────────────────────────────────────────────────
// 1/3 배분 (라성이 나머지)
// ────────────────────────────────────────────────────────
export function splitMargin(totalMargin: number): {
  korea_a1: number
  geumhwa: number
  raseong: number
} {
  const base = Math.floor(totalMargin / 3)
  return { korea_a1: base, geumhwa: base, raseong: totalMargin - base * 2 }
}

// ────────────────────────────────────────────────────────
// KRW 품목 마진 계산
// ────────────────────────────────────────────────────────
export function calcMargin(
  sellPrice: number,
  costPrice: number,
  quantityKg: number
): MarginResult {
  const quantity_ton = quantityKg / 1000
  const total_margin = Math.round((sellPrice - costPrice) * quantity_ton)
  const { korea_a1, geumhwa, raseong } = splitMargin(total_margin)
  return { quantity_ton, sell_price: sellPrice, cost_price: costPrice, total_margin, korea_a1, geumhwa, raseong }
}

// ────────────────────────────────────────────────────────
// 계약 타입에 맞는 마진 계산 (KRW / USD 자동 처리)
// ────────────────────────────────────────────────────────
export interface ContractForMargin {
  sell_price: number
  cost_price: number
  currency: string             // 'KRW' | 'USD'
  reference_exchange_rate?: number | null
}

export function calcMarginFromContract(
  contract: ContractForMargin,
  quantityKg: number
): MarginResult & { sell_price_krw: number; cost_price_krw: number; exchange_rate_used: number | null } {
  let sell_price_krw: number
  let cost_price_krw: number
  let exchange_rate_used: number | null = null

  if (contract.currency === 'USD') {
    const rate = contract.reference_exchange_rate
    if (!rate || rate <= 0) {
      // USD 계약에 참고환율이 없으면 마진 계산 불가 — 데이터 정합성 오류
      throw new Error(
        `USD 계약(판매가=${contract.sell_price})에 참고환율이 없습니다. ` +
        `낙찰 단가 관리에서 참고 환율을 입력해 주세요.`
      )
    }
    sell_price_krw = contract.sell_price * rate
    cost_price_krw = contract.cost_price * rate
    exchange_rate_used = rate
  } else {
    sell_price_krw = contract.sell_price
    cost_price_krw = contract.cost_price
  }

  const result = calcMargin(sell_price_krw, cost_price_krw, quantityKg)
  return { ...result, sell_price_krw, cost_price_krw, exchange_rate_used }
}

// ────────────────────────────────────────────────────────
// 추가 배분 마진 (호진 배분 등)
//   addl_margin_per_ton: 톤당 마진 (화림이 결정)
// ────────────────────────────────────────────────────────
export function calcAddlMargin(
  addlQuantityKg: number,
  addlMarginPerTon: number
): { quantity_ton: number; total_margin: number } & ReturnType<typeof splitMargin> {
  const quantity_ton = addlQuantityKg / 1000
  const total_margin = Math.round(addlMarginPerTon * quantity_ton)
  return { quantity_ton, total_margin, ...splitMargin(total_margin) }
}

// ────────────────────────────────────────────────────────
// 포맷 헬퍼
// ────────────────────────────────────────────────────────
export function fmtKrw(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value)) + '원'
}

export function fmtNum(value: number, decimals = 0): string {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}
