/**
 * 커미션 입력 계산·검증 순수 함수 (React 비의존 — 단위 테스트 대상)
 * 돈 직결 로직: 음수/0/공월을 코드로 거부하고, 총액은 결정적으로 반올림한다.
 */
import { splitMargin } from '@/lib/margin'

export interface CommissionPayload {
  year_month: string
  quantity_kg: number
  price_per_ton: number
  commission_amount: number
}

export type CommissionValidation =
  | { ok: true; payload: CommissionPayload }
  | { ok: false; error: string }

/** 커미션 총액(원) = round(물량톤 × 단가). 양수 입력 가정 */
export function commissionTotal(qtyTon: number, pricePerTon: number): number {
  return Math.round(qtyTon * pricePerTon)
}

/** 입력 미리보기: 유효하면 총액 + 3사 배분, 아니면 null */
export function commissionPreview(qtyRaw: string, priceRaw: string) {
  const qty = parseFloat(qtyRaw)
  const price = parseFloat(priceRaw)
  if (!qty || qty <= 0 || !price || price <= 0) return null
  const total = commissionTotal(qty, price)
  return { total, ...splitMargin(total) }
}

/** 저장 전 결정적 검증 + payload 생성 (공월/물량≤0/단가≤0 거부) */
export function validateCommissionInput(
  ym: string,
  qtyRaw: string,
  priceRaw: string,
): CommissionValidation {
  const qty = parseFloat(qtyRaw)
  const price = parseFloat(priceRaw)
  if (!ym)                  return { ok: false, error: '기준 월을 입력하세요.' }
  if (!qty || qty <= 0)     return { ok: false, error: '물량을 입력하세요.' }
  if (!price || price <= 0) return { ok: false, error: '화림 단가를 입력하세요.' }
  return {
    ok: true,
    payload: {
      year_month: ym,
      quantity_kg: qty * 1000,
      price_per_ton: price,
      commission_amount: commissionTotal(qty, price),
    },
  }
}
