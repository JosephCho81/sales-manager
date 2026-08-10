-- 감가 반영 매입 계산서의 실제 부가세 기록
--
-- 배경: 거래처가 감가를 계산서에 반영하는 방식이 달마다 달라 부가세 끝자리를 공식으로
--       못 맞춘다. 2026-06 분탄(동창)은 라인별 절사 합산(39,233,044)이 실물과 일치했으나,
--       2026-07 분탄은 같은 소수부 구조인데도 차감 후 일괄 절사(37,061,476)가 실물이었다.
--       한 공식으로 두 달을 동시에 맞출 수 없으므로, 실물 값을 데이터로 받는다.
--
-- NULL이면 기존 계산(라인별 절사 합산) 그대로 사용 — 기존 월 금액 불변.

ALTER TABLE monthly_depreciations
  ADD COLUMN IF NOT EXISTS cost_vat_actual NUMERIC(18, 0)
    CHECK (cost_vat_actual IS NULL OR cost_vat_actual >= 0);

COMMENT ON COLUMN monthly_depreciations.cost_vat_actual IS
  '이 감가가 차감된 매입 계산서(cost_deduct_ym 납품월)의 실제 부가세. 실물 세금계산서 값을 그대로 넣는다. NULL이면 라인별 절사 계산값 사용';
