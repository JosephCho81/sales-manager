-- 품목×납품월 단위 감가 (동국제강 월말 일괄 통보 — 분탄 렘코 미수)
-- 렘코 매출 계산서만 차감, 동창 매입은 총액 → 감가는 계약 종료 후 렘코가 일괄 지급
CREATE TABLE monthly_depreciations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  year_month  TEXT NOT NULL CHECK (year_month ~ '^\d{4}-\d{2}$'),
  amount      NUMERIC NOT NULL CHECK (amount > 0),
  memo        TEXT,
  settled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, year_month)
);

ALTER TABLE monthly_depreciations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON monthly_depreciations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
