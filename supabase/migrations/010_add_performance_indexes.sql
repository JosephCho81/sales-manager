-- 쿼리 성능 개선을 위한 인덱스 추가

-- analytics / invoices 페이지에서 invoice_month 기준 조회 (gte/lte, eq)
CREATE INDEX IF NOT EXISTS deliveries_invoice_month_idx
  ON deliveries(invoice_month);

-- analytics 커미션 조회: year_month 범위 / IN 쿼리
CREATE INDEX IF NOT EXISTS commissions_year_month_idx
  ON commissions(year_month);

-- invoices 페이지 FeSi 환율 조회: bl_date 범위 쿼리
CREATE INDEX IF NOT EXISTS fx_rates_bl_date_idx
  ON fx_rates(bl_date);
