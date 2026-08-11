-- ─────────────────────────────────────────────────────────────
-- 019: updated_at + 자동 갱신 트리거 (낙관적 잠금용)
--
-- 여러 명이 같은 화면을 보게 되면서, 오래된 데이터를 들고 있던 탭이 나중에
-- 저장하면 그 사이의 수정이 조용히 덮어써진다(lost update). 단가·물량·감가는
-- 그대로 금액 오류가 되므로, 수정 시작 시점의 updated_at을 조건으로 걸어
-- "그 사이 누가 바꿨으면 저장 거부"로 만든다.
--
-- 트리거로 갱신하는 이유: 앱이 updated_at을 payload에 넣는 걸 잊어도
-- DB가 항상 올바른 값을 남기게 하기 위해서다. BEFORE UPDATE이므로
-- WHERE updated_at = <기대값> 비교는 갱신 **전** 값과 이뤄진다.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'contracts', 'deliveries', 'products', 'expenses', 'monthly_depreciations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE '테이블 없음, 건너뜀: %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz', t);
    -- 기존 행 백필: created_at이 있으면 그 값, 없으면 now()
    EXECUTE format('UPDATE public.%I SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_at SET DEFAULT now()', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_at SET NOT NULL', t);

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;
