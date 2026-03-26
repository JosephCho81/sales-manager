-- contracts 테이블에 FeSi용 참고 환율 컬럼 추가
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS reference_exchange_rate NUMERIC(10, 2) DEFAULT NULL;

COMMENT ON COLUMN contracts.reference_exchange_rate IS
  'FeSi 전용 참고 환율 (원/USD). 계약 시점 기준 참고값. 실제 정산은 BL 날짜 기준 환율 적용.';
