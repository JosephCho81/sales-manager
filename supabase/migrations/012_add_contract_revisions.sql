-- 낙찰 단가 "기간 중 개정(변경)" 이력
-- 기존 계약을 변경 적용일 직전까지로 잘라내고, 새 단가 행을 새 기간으로 생성한다.
-- 개정 사유·시점·이전 계약 연결을 구조적으로 기록한다.

alter table public.contracts
  add column if not exists revision_reason        text,
  add column if not exists revised_at             timestamptz,
  add column if not exists supersedes_contract_id uuid references public.contracts(id) on delete set null,
  add column if not exists updated_at             timestamptz;

-- 이력 체인 조회용 인덱스
create index if not exists contracts_supersedes_idx
  on public.contracts(supersedes_contract_id);

-- ──────────────────────────────────────────
-- revise_contract: 단가 개정을 원자적으로 처리
--   1) 원본 계약을 (적용일 - 1)로 잘라냄
--   2) 적용일~원본종료일 구간에 새 단가 행 생성 (원본 필드 상속)
--   3) 새 행을 product join 형태로 반환
-- ──────────────────────────────────────────
create or replace function public.revise_contract(
  p_original_id   uuid,
  p_effective_date date,
  p_sell_price    numeric,
  p_cost_price    numeric,
  p_ref_rate      numeric,
  p_reason        text
)
returns setof public.contracts
language plpgsql
security definer
as $$
declare
  v_orig   public.contracts%rowtype;
  v_new_id uuid;
begin
  select * into v_orig from public.contracts where id = p_original_id for update;
  if not found then
    raise exception '원본 계약을 찾을 수 없습니다.';
  end if;

  -- 적용일은 원본 기간 내(시작일 다음날 ~ 종료일)여야 함
  if p_effective_date <= v_orig.start_date then
    raise exception '변경 적용일은 원본 시작일(%) 이후여야 합니다.', v_orig.start_date;
  end if;
  if p_effective_date > v_orig.end_date then
    raise exception '변경 적용일은 원본 종료일(%) 이내여야 합니다.', v_orig.end_date;
  end if;

  if coalesce(p_cost_price, 0) <= 0 then
    raise exception '새 매입단가는 0보다 커야 합니다.';
  end if;
  if coalesce(p_sell_price, 0) <= 0 then
    raise exception '새 판매단가는 0보다 커야 합니다.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception '개정 사유를 입력하세요.';
  end if;
  if v_orig.currency = 'USD' and coalesce(p_ref_rate, 0) <= 0 then
    raise exception 'USD 계약은 참고 환율이 필요합니다.';
  end if;

  -- 1) 원본을 변경 적용일 직전까지로 잘라냄
  update public.contracts
     set end_date   = p_effective_date - 1,
         updated_at = now()
   where id = v_orig.id;

  -- 2) 새 단가 행 생성 (원본 필드 상속)
  insert into public.contracts (
    product_id, start_date, end_date,
    sell_price, cost_price, currency,
    exchange_rate_basis, reference_exchange_rate,
    invoice_month_offset, margin_distribution, memo,
    supersedes_contract_id, revision_reason, revised_at
  ) values (
    v_orig.product_id, p_effective_date, v_orig.end_date,
    p_sell_price, p_cost_price, v_orig.currency,
    v_orig.exchange_rate_basis,
    case when v_orig.currency = 'USD' then p_ref_rate else null end,
    v_orig.invoice_month_offset, v_orig.margin_distribution, v_orig.memo,
    v_orig.id, p_reason, now()
  )
  returning id into v_new_id;

  return query select * from public.contracts where id = v_new_id;
end;
$$;
