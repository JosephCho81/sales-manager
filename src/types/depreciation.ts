export interface MonthlyDepreciation {
  id: string
  product_id: string
  /** 납품월 'YYYY-MM' (지급월 아님 — 분탄 offset=1이면 지급월 −1) */
  year_month: string
  amount: number
  memo: string | null
  /** 렘코 정산(회수) 완료 시각. null = 미정산 */
  settled_at: string | null
  created_at: string
}
