-- 감가 통보일 — 현지에서 감가를 통보받은 실제 날짜
--
-- 지금까지 남는 날짜는 귀속 납품월(YYYY-MM)과 등록 시각뿐이었다. 2026-08 소괴탄·분탄처럼
-- 한 납품월 감가가 9/3, 9/6 며칠에 걸쳐 나눠 통보되면 목록에서 어느 행이 어느 통보분인지
-- 구분이 안 된다. 감가 관리 화면이 품목 단위로 접히면서 펼쳤을 때의 식별자가 필요하다.
--
-- 계산서 금액에는 아무 영향이 없다 — 반영 위치는 sales_deduct_ym / cost_deduct_ym가 정한다.
-- 기존 4건은 통보일이 남아 있지 않으므로 NULL로 둔다 (화면에서 "미입력" 표시).

ALTER TABLE monthly_depreciations
  ADD COLUMN IF NOT EXISTS notified_on date;

COMMENT ON COLUMN monthly_depreciations.notified_on IS
  '현지 감가 통보일. 표시·식별용이며 계산서 금액에는 영향 없음';
