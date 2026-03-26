-- invoice_instructions에 타입 컬럼 추가
ALTER TABLE invoice_instructions
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'other';
  -- 'sales'(매출) | 'cost'(원가) | 'commission'(커미션) | 'other'

COMMENT ON COLUMN invoice_instructions.invoice_type IS
  'sales=매출계산서, cost=원가계산서, commission=커미션, other=기타';
