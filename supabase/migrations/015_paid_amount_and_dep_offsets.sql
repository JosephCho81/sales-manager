-- 2026-05 AL30(현대제철) 감가 대응 — docs/al30-depreciation-2026-05.md
--
-- 배경: 현대제철이 감가를 통보 없이 반영해 역발행. 감가를 모르고 저장한 매출 금액이
--       실제 세금계산서보다 커서, 60일 뒤 입금액을 보고서야 차이를 알게 된다.
--       "우리 저장액 ≠ 실입금액" 상태를 표현할 수단이 없어 차액이 소멸하던 문제.

-- ① 실입금/실지급액. NULL = 계산서 total_amount와 동일(정상)
ALTER TABLE invoice_instructions
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(18, 0);

COMMENT ON COLUMN invoice_instructions.paid_amount IS
  '실입금/실지급액. NULL이면 total_amount와 동일. 감가·상계 등으로 계산서와 다를 때 기록하며, 차액은 monthly_depreciations로 확정된다';

-- ② 감가: 매출 감액월 / 매입 차감월 분리
--    분탄(보관형)  : sales_deduct_ym=NULL,       cost_deduct_ym=year_month  → 매입만 당월 차감
--    AL30(통과형)  : sales_deduct_ym=year_month, cost_deduct_ym=회수 납품월 → 매출 감액 발행 후 매입에서 회수
ALTER TABLE monthly_depreciations
  ADD COLUMN IF NOT EXISTS sales_deduct_ym TEXT
    CHECK (sales_deduct_ym IS NULL OR sales_deduct_ym ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  ADD COLUMN IF NOT EXISTS cost_deduct_ym  TEXT
    CHECK (cost_deduct_ym  IS NULL OR cost_deduct_ym  ~ '^\d{4}-(0[1-9]|1[0-2])$');

COMMENT ON COLUMN monthly_depreciations.sales_deduct_ym IS
  '매출 계산서가 감액 발행된 납품월. 이 달 매출·마진·커미션이 함께 줄어든다. NULL이면 매출 영향 없음(분탄)';
COMMENT ON COLUMN monthly_depreciations.cost_deduct_ym IS
  '매입 계산서에서 이 감가를 차감할 납품월. 분탄=year_month(당월), AL30=회수 합의 납품월';

-- 기존 분탄 행 백필 — 매입 당월 차감, 매출 영향 없음
UPDATE monthly_depreciations
   SET cost_deduct_ym = year_month
 WHERE cost_deduct_ym IS NULL;

-- 회수/반환 대기 조회용 (미정산 건만)
CREATE INDEX IF NOT EXISTS monthly_dep_unsettled_idx
  ON monthly_depreciations (cost_deduct_ym)
  WHERE settled_at IS NULL;
