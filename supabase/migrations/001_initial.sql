-- ============================================================
-- 판매관리 시스템 초기 스키마
-- ============================================================

-- ──────────────────────────────────────────
-- products (품목)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,        -- 내부 코드 (예: AL35B)
  display_name  TEXT NOT NULL,               -- 화면 표시명 (예: AL-35B)
  buyer         TEXT NOT NULL DEFAULT '',    -- 납품처
  unit          TEXT NOT NULL DEFAULT 'kg',
  price_unit    TEXT NOT NULL DEFAULT 'KRW_TON',  -- KRW_TON | USD_TON | KRW_KG
  vat           TEXT NOT NULL DEFAULT 'TEN_PERCENT', -- NONE | TEN_PERCENT
  chain         JSONB NOT NULL DEFAULT '{}',
  memo          TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- contracts (낙찰 단가 계약)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  sell_price            NUMERIC(18, 4) NOT NULL,   -- 판매단가
  cost_price            NUMERIC(18, 4) NOT NULL,   -- 원가단가
  currency              TEXT NOT NULL DEFAULT 'KRW', -- KRW | USD
  exchange_rate_basis   TEXT,
  margin_distribution   JSONB,                      -- 특수 배분 룰 (기본은 1/3)
  memo                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contracts_dates_check CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS contracts_product_date_idx
  ON contracts(product_id, start_date, end_date);

-- ──────────────────────────────────────────
-- deliveries (납품 건 / 입고)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month          TEXT NOT NULL,           -- YYYY-MM
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  contract_id         UUID NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,
  quantity_kg         NUMERIC(18, 3) NOT NULL CHECK (quantity_kg > 0),
  addl_quantity_kg    NUMERIC(18, 3),          -- 추가 물량 (호진 배분 등)
  addl_margin_per_ton NUMERIC(18, 4),          -- 추가 물량 단위 마진
  memo                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deliveries_month_product_idx
  ON deliveries(year_month, product_id);

-- ──────────────────────────────────────────
-- invoice_instructions (계산서 발행 지시) — 2단계용
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_instructions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month        TEXT NOT NULL,
  product_id        UUID REFERENCES products(id) ON DELETE SET NULL,
  delivery_ids      JSONB,                      -- 연결된 delivery id 배열
  from_company      TEXT NOT NULL,
  to_company        TEXT NOT NULL,
  supply_amount     NUMERIC(18, 0) NOT NULL,
  vat_amount        NUMERIC(18, 0) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(18, 0) NOT NULL,
  invoice_basis_date DATE,
  issue_deadline    DATE,
  payment_due_date  DATE,
  is_paid           BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at           TIMESTAMPTZ,
  memo              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_month_idx ON invoice_instructions(year_month);

-- ──────────────────────────────────────────
-- hyundai_transactions (현대제철 전용) — 4단계용
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hyundai_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month          TEXT NOT NULL,
  invoice_date        DATE NOT NULL,
  invoice_seq         SMALLINT NOT NULL CHECK (invoice_seq BETWEEN 1 AND 3),
  quantity_kg         NUMERIC(18, 3) NOT NULL,
  sell_price          NUMERIC(18, 4) NOT NULL,
  cost_price          NUMERIC(18, 4) NOT NULL,
  supply_amount       NUMERIC(18, 0),
  vat_amount          NUMERIC(18, 0),
  bill_due_date       DATE,                     -- invoice_date + 60일
  commission_amount   NUMERIC(18, 0),
  commission_type     TEXT,                     -- margin | shortage
  margin_distribution JSONB,
  memo                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- fx_rates (환율 기록 — 페로실리콘용)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fx_rates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bl_date          DATE NOT NULL,
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  rate_krw_per_usd NUMERIC(10, 2) NOT NULL,
  memo             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- RLS (Row Level Security) 설정
-- 로그인한 사용자만 전체 접근 허용
-- ──────────────────────────────────────────
ALTER TABLE products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_instructions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyundai_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates               ENABLE ROW LEVEL SECURITY;

-- 로그인된 사용자 전체 허용 정책
CREATE POLICY "authenticated_all" ON products               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON contracts              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON deliveries             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON invoice_instructions   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON hyundai_transactions   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON fx_rates               FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────
-- 초기 품목 데이터 시드
-- ──────────────────────────────────────────
INSERT INTO products (name, display_name, buyer, unit, price_unit, vat, chain, memo) VALUES
  ('AL35B',  'AL-35B',    '동국제강', 'kg', 'KRW_TON', 'TEN_PERCENT',
   '{"steps":["동국제강","한국에이원","금화","화림"],"buy_from":"화림","sell_to":"동국제강","special":"hoejin"}',
   'AL35B 동국제강 납품 (호진 배분 있음)'),

  ('AL65B',  'AL-65B',    '동국제강', 'kg', 'KRW_TON', 'TEN_PERCENT',
   '{"steps":["동국제강","한국에이원","금화","화림"],"buy_from":"화림","sell_to":"동국제강"}',
   'AL65B 동국제강 납품'),

  ('SOGGAE', '소괴탄',    '동국제강', 'kg', 'KRW_TON', 'NONE',
   '{"steps":["동국제강","한국에이원","렘코"],"buy_from":"렘코","sell_to":"동국제강"}',
   'VAT 없음'),

  ('BUNTAN', '분탄',      '동국제강', 'kg', 'KRW_TON', 'TEN_PERCENT',
   '{"steps":["동국제강","렘코","한국에이원","동창"],"buy_from":"동창","sell_to":"동국제강"}',
   NULL),

  ('FESI75', 'FeSi75',   '동국제강', 'kg', 'USD_TON', 'TEN_PERCENT',
   '{"steps":["EG","한국에이원","동국제강"],"buy_from":"EG","sell_to":"동국제강","special":"ferrosilicon"}',
   '페로실리콘 75% — 달러 결제'),

  ('FESI60', 'FeSi60',   '동국제강', 'kg', 'USD_TON', 'TEN_PERCENT',
   '{"steps":["EG","한국에이원","동국제강"],"buy_from":"EG","sell_to":"동국제강","special":"ferrosilicon"}',
   '페로실리콘 60% — 달러 결제'),

  ('AL30',   'AL-30',    '현대제철', 'kg', 'KRW_TON', 'TEN_PERCENT',
   '{"steps":["화림","한국에이원","현대제철"],"buy_from":"화림","sell_to":"현대제철","special":"hyundai"}',
   '현대제철 10일 단위 역발행 / 60일 어음')

ON CONFLICT (name) DO NOTHING;
