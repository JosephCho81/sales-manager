-- ─────────────────────────────────────────────────────────────
-- 020: 계산서 실물 대사 (생성값 vs 실제 세금계산서)
--
-- 거래처마다 부가세 절사 관례가 달라 라인별로 1원씩 어긋나는 일이 반복된다
-- (2026-06 분탄은 라인별 절사, 2026-07은 일괄 절사가 실물). 지금은 매달 눈으로
-- 대조하고 있어서, 놓치면 그대로 넘어간다.
--
-- 실물 값을 계산서 행에 붙여 두면
--   ① 차이가 있는 줄만 화면에서 튀어나오고
--   ② 어느 달을 대사했는지가 데이터로 남아 "안 본 달"이 드러나며
--   ③ cost_vat_actual에 넣어야 할 값이 무엇인지 바로 보인다.
--
-- 재생성 시 지급완료 기록과 함께 보존된다 (actions.ts replaceInvoices).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE invoice_instructions
  ADD COLUMN IF NOT EXISTS actual_supply_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_vat_amount    NUMERIC,
  ADD COLUMN IF NOT EXISTS reconciled_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconcile_memo       TEXT;

-- 대사 완료 = 실물 공급가액이 입력된 상태. 셋 중 하나만 들어가는 걸 막는다.
ALTER TABLE invoice_instructions DROP CONSTRAINT IF EXISTS invoice_reconcile_complete;
ALTER TABLE invoice_instructions ADD  CONSTRAINT invoice_reconcile_complete CHECK (
  (reconciled_at IS NULL AND actual_supply_amount IS NULL AND actual_vat_amount IS NULL)
  OR
  (reconciled_at IS NOT NULL AND actual_supply_amount IS NOT NULL AND actual_vat_amount IS NOT NULL)
);

-- 미대사 계산서 조회용 (월별 대사 현황)
CREATE INDEX IF NOT EXISTS invoice_instructions_reconciled_idx
  ON invoice_instructions(year_month, reconciled_at);
