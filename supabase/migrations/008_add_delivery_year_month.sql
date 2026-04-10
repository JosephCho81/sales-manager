-- 계산서에 납품월(delivery_year_month) 컬럼 추가
-- 계산서 발행월(year_month)과 별도로 납품 기준월을 표시하기 위함
-- (AL35B, AL30 등 invoice_month_offset 있는 품목에서 납품월 != 발행월)
ALTER TABLE invoice_instructions ADD COLUMN IF NOT EXISTS delivery_year_month TEXT;
