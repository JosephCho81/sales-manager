-- depreciation 단위 변경: kg(물량) → 원(금액)
-- 동국제강 지정 감가는 물량 차감이 아닌 금액 차감 방식
ALTER TABLE deliveries RENAME COLUMN depreciation_kg TO depreciation_amount;
