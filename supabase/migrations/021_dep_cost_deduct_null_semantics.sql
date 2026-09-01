-- cost_deduct_ym NULL 의미 변경 — 코멘트만 갱신(데이터 변경 없음)
--
-- 015에서 NULL은 "미지정 = 당월 차감"이었고 기존 행을 전부 백필했다.
-- 2026-08 소괴탄 감가처럼 **매출만 감액하고 매입 계산서로는 회수하지 않는**
-- (계약 종료 후 렘코와 현금 정산) 경우를 표현할 수단이 없어 NULL을 재정의한다.
--
--   sales_deduct_ym NULL + cost_deduct_ym 값  → 보관형 (매입만 차감, 배분 불변)
--   sales_deduct_ym 값   + cost_deduct_ym 값  → 통과형 (매출 −, 회수월 매입 +)
--   sales_deduct_ym 값   + cost_deduct_ym NULL→ 통과형·별도 정산 (계산서 회수 없음)
--
-- 코드는 더 이상 `cost_deduct_ym ?? year_month` 폴백을 쓰지 않는다.
-- ※ 015의 백필 UPDATE를 다시 실행하면 별도 정산 행이 당월 차감으로 바뀐다 — 재실행 금지.

COMMENT ON COLUMN monthly_depreciations.cost_deduct_ym IS
  '매입 계산서에서 이 감가를 차감할 납품월. 분탄=year_month(당월), AL30=회수 합의 납품월. NULL = 계산서로 회수하지 않음(계약 종료 후 현금 정산)';
