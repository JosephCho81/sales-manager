export interface MonthlyDepreciation {
  id: string
  product_id: string
  /** 납품월 'YYYY-MM' (지급월 아님 — 분탄 offset=1이면 지급월 −1) */
  year_month: string
  amount: number
  memo: string | null
  /** 렘코 반환(보관형) 또는 화림 회수(통과형) 완료 시각. null = 미정산 */
  settled_at: string | null
  /** 매출 입금이 감액된 납품월. null = 매출 영향 없음(보관형·분탄) */
  sales_deduct_ym: string | null
  /** 매입 계산서에서 차감할 납품월. 분탄=year_month, AL30=회수 합의 납품월 */
  cost_deduct_ym: string | null
  created_at: string
}
