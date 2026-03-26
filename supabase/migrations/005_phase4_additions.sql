-- Phase 4: 호진 부족분 필드 추가 + hyundai_transactions 제약 완화

-- ① deliveries: 호진 부족분 컬럼 추가 (AL35B 전용)
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS hoejin_shortage_kg    NUMERIC(18, 3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hoejin_shortage_price NUMERIC(18, 4) DEFAULT NULL;

COMMENT ON COLUMN deliveries.hoejin_shortage_kg    IS '호진 부족 물량 (kg) — AL35B 전용';
COMMENT ON COLUMN deliveries.hoejin_shortage_price IS '호진 부족분 단가 (원/톤, 화림 통보)';

-- ② hyundai_transactions: invoice_seq 제약 완화 (부족분 항목 허용)
ALTER TABLE hyundai_transactions
  DROP CONSTRAINT IF EXISTS hyundai_transactions_invoice_seq_check;

ALTER TABLE hyundai_transactions
  ADD CONSTRAINT hyundai_transactions_invoice_seq_check
  CHECK (
    commission_type = 'shortage'       -- 부족분은 seq 제약 없음
    OR (invoice_seq BETWEEN 1 AND 3)
  );

-- invoice_seq NULL 허용 (부족분 항목용)
ALTER TABLE hyundai_transactions
  ALTER COLUMN invoice_seq DROP NOT NULL;

COMMENT ON TABLE hyundai_transactions IS
  '현대제철 AL30 전용. invoice_seq=1/2/3: 10일 단위 거래. commission_type=shortage: 부족분 커미션 입력.';
