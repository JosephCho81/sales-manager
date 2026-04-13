-- 분탄(BUNTAN) 거래 체인 수정: 동국제강 없음, 매출처=렘코
-- 실제 흐름: 동창 → 한국에이원 → 렘코
UPDATE products
SET buyer = '렘코'
WHERE name = 'BUNTAN';
