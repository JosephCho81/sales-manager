-- deliveries 테이블에 입고 날짜(일자) 컬럼 추가
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS delivery_date DATE DEFAULT NULL;

COMMENT ON COLUMN deliveries.delivery_date IS
  '입고 날짜 (YYYY-MM-DD). FeSi: BL 날짜 기준 환율 적용. AL30: 10일 단위 계산서 구분.';
