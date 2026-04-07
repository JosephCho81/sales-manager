-- Migration 006: contracts에 cost_price_2 컬럼 추가
-- cost_price   = 한국에이원-금화 단가 (에이원 배분단가)
-- cost_price_2 = 금화-화림 단가 (화림 원가단가)

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS cost_price_2 NUMERIC(18, 4) DEFAULT NULL;

COMMENT ON COLUMN contracts.cost_price   IS '원가단가 — 한국에이원-금화 기준 (에이원 배분단가)';
COMMENT ON COLUMN contracts.cost_price_2 IS '원가단가 2 — 금화-화림 기준 (화림 원가단가)';
