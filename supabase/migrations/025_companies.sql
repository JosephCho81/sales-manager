-- ─────────────────────────────────────────────────────────────
-- 025: 거래처 사업자정보 (홈택스 엑셀 일괄발급용)
--
-- 계산서 발행 지시(invoice_instructions)에는 회사 이름만 있다. 홈택스 일괄발급 양식은
-- 공급자·공급받는자의 등록번호·상호·성명 등이 필수라 여기 한 번 입력해 둔다.
-- name은 invoice_instructions.from_company/to_company 문자열과 정확히 같아야 매칭된다
-- (예: '(주)나성', '(주)한국에이원', '금화'). 상호(trade_name)는 계산서에 찍히는 정식 상호.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  name        TEXT PRIMARY KEY,
  biz_no      TEXT NOT NULL CHECK (biz_no ~ '^[0-9]{10}$'),
  trade_name  TEXT NOT NULL,
  ceo_name    TEXT NOT NULL,
  address     TEXT NOT NULL DEFAULT '',
  biz_type    TEXT NOT NULL DEFAULT '',
  biz_item    TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = authenticated 직접 접근 거부. 앱은 service_role로만 읽고 쓴다 (017 원칙)
