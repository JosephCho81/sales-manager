-- ─────────────────────────────────────────────────────────────
-- 017: 사용자 역할(owner/viewer) + RLS 잠금
--
-- 역할
--   owner  = 입력·수정·삭제 가능 (cho)
--   viewer = 조회 전용 (kim, choi)
--
-- RLS를 잠그는 이유
--   앱의 모든 DB 접근은 서버(service_role)를 거친다. 브라우저가 Supabase에
--   직접 말을 거는 건 Auth(로그인/로그아웃)뿐이다. 그런데 001의
--   "authenticated_all" (FOR ALL USING(true) WITH CHECK(true)) 정책은
--   "로그인만 하면 누구나" anon key + 자기 access token으로 PostgREST를 직접
--   호출해 모든 테이블을 수정할 수 있게 열어둔다. anon key는 브라우저 번들에
--   들어 있어 공개 정보다 — 즉 viewer(kim/choi)의 읽기 전용 제한이 서버 액션
--   바깥에서 그대로 무력화된다. 앱이 쓰지 않는 경로이므로 통째로 닫는다.
--   (service_role은 RLS를 우회하므로 앱 동작에는 영향 없음)
-- ─────────────────────────────────────────────────────────────

-- user_roles는 마이그레이션 밖(대시보드)에서 이미 만들어져 운영 중일 수 있다
-- (joseph@a1kor.com / role=owner). 기존 행을 깨지 않도록 전부 추가·완화만 한다.
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   text UNIQUE,
  role       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS username   text;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  BEGIN
    ALTER TABLE user_roles ADD CONSTRAINT user_roles_username_key UNIQUE (username);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END;
END $$;

-- 기존 role 체크 제약(예: 'owner','rep')을 owner/viewer로 교체.
-- 'rep' 같은 옛 값이 남아 있으면 getRole()이 null로 취급 → 접근 거부되므로 viewer로 정리한다.
UPDATE user_roles SET role = 'viewer' WHERE role NOT IN ('owner', 'viewer');

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD  CONSTRAINT user_roles_role_check CHECK (role IN ('owner', 'viewer'));

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 본인 역할만 읽기. 쓰기 정책 없음 = authenticated는 자기 역할을 owner로
-- 승격시킬 수 없다 (service_role만 변경 가능).
DROP POLICY IF EXISTS "read_own_role" ON user_roles;
CREATE POLICY "read_own_role" ON user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 업무 테이블: RLS 켜고 authenticated 직접 접근 정책 제거 ──
DO $$
DECLARE
  t text;
  p record;
  tables text[] := ARRAY[
    'products', 'contracts', 'deliveries', 'invoice_instructions',
    'hyundai_transactions', 'fx_rates', 'monthly_depreciations',
    'commissions', 'expenses', 'audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE '테이블 없음, 건너뜀: %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- 남아 있는 정책은 전부 제거 → 정책 0개 + RLS on = anon/authenticated 전면 거부
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;
