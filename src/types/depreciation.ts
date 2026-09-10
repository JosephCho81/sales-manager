export interface MonthlyDepreciation {
  id: string
  product_id: string
  /** 납품월 'YYYY-MM' (지급월 아님 — 분탄 offset=1이면 지급월 −1) */
  year_month: string
  amount: number
  memo: string | null
  /**
   * 감가 대상 납품일 'YYYY-MM-DD' (023·024) — 매출처가 "몇월 몇일분"으로 지정해 내려보낸 날짜.
   * 월은 `year_month`와 항상 같다. NULL = 월 단위 일괄 통보(분탄)
   */
  target_delivery_date: string | null
  /** 렘코 연말 정리 또는 화림 회수 완료 시각. null = 미정산 */
  settled_at: string | null
  /** 매출 입금이 감액된 납품월. null = 매출 영향 없음(분탄) */
  sales_deduct_ym: string | null
  /** 매입 계산서에서 차감할 납품월. null = 어느 계산서도 건드리지 않음(소괴탄) */
  cost_deduct_ym: string | null
  /** 감가 반영 매입 계산서의 실제 부가세(실물 세금계산서 값). null = 라인별 절사 계산값 사용 */
  cost_vat_actual: number | null
  created_at: string
  /** 낙관적 잠금 기준 (019) */
  updated_at?: string | null
}
