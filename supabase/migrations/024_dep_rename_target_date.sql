-- notified_on -> target_delivery_date : 이름이 뜻과 달랐다
--
-- 023에서 "현지 감가 통보일"로 만들었으나, 실제로 동국제강·현대제철이 내려보내는 값은
-- "몇월 몇일분에 대한 감가"다. 즉 통보받은 날이 아니라 **감가 대상 납품일**이다.
--
-- 그래서 이 날짜의 월은 귀속 납품월(year_month)과 항상 같다. 담당자가 같은 값을 두 번
-- 넣던 것을 없애고, 대상일이 있으면 서버가 year_month를 그 월로 강제한다.
-- 분탄처럼 월말 일괄 통보라 날짜가 없는 감가는 이 칸을 비우고 귀속 납품월만 넣는다.

ALTER TABLE monthly_depreciations
  RENAME COLUMN notified_on TO target_delivery_date;

COMMENT ON COLUMN monthly_depreciations.target_delivery_date IS
  '감가 대상 납품일 — 매출처가 "몇월 몇일분"으로 지정해 내려보낸 날짜. 월은 year_month와 같다. NULL = 월 단위 일괄 통보(분탄)';
