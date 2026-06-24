-- fx_rates upsert(onConflict: product_id,bl_date)가 동작하려면
-- (product_id, bl_date) UNIQUE 제약이 필요. 누락되어 있어 입고 환율 저장이
-- 조용히 실패하던 버그 수정.
ALTER TABLE fx_rates
  ADD CONSTRAINT fx_rates_product_bl_unique UNIQUE (product_id, bl_date);
