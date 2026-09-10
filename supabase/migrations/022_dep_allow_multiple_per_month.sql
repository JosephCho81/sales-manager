-- 같은 품목·납품월에 감가 여러 건 허용 — UNIQUE (product_id, year_month) 제거
--
-- 실제 통보가 월 1건이라는 전제(014)가 깨졌다. 2026-08 소괴탄·분탄은 현지에서
-- 9/3, 9/6 등 며칠에 걸쳐 나눠 통보돼 한 납품월에 3건이 생긴다. 제약 때문에
-- 2건째부터 23505로 거부돼 감가가 통째로 입력되지 못하고 있었다.
--
-- 코드는 이미 여러 건을 합산한다 — invoice-generator/index.ts의 slice()가
-- 품목·차감월로 filter 후 amount를 reduce하고, 배지·산식(lib/depreciation.ts)과
-- analytics 집계도 행 단위로 돈다. 따라서 DB 제약만 풀면 된다.
--
-- 주의: cost_vat_actual(실물 매입 계산서 세액)은 계산서 한 장의 총액이라 합산할 수
-- 없다. 같은 차감월 감가 중 둘 이상이 값을 가지면 costDepFor()가 계산값으로
-- 되돌린다 — 실물 세액은 그 달 감가 중 **한 건에만** 입력할 것.

-- 제약 이름이 기본값과 다를 수 있어 (product_id, year_month) 조합의 UNIQUE를 찾아 지운다
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'monthly_depreciations'
      AND con.contype = 'u'
      AND (
        -- attname은 name 타입 — text[]와 비교하려면 캐스팅해야 한다 (42883)
        SELECT array_agg(att.attname::text ORDER BY att.attname::text)
        FROM unnest(con.conkey) k
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k
      ) = ARRAY['product_id', 'year_month']
  LOOP
    EXECUTE format('ALTER TABLE monthly_depreciations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- UNIQUE 인덱스가 사라지므로 조회용 일반 인덱스를 남긴다 (귀속월 매칭)
CREATE INDEX IF NOT EXISTS idx_monthly_dep_product_ym
  ON monthly_depreciations (product_id, year_month);

COMMENT ON TABLE monthly_depreciations IS
  '품목×납품월 감가. 같은 품목·납품월에 여러 건 가능(통보가 나눠 오는 경우) — 반영 시 합산된다';
