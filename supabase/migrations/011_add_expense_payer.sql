-- 비용 정산: 최초 지불 업체 추적
alter table public.expenses
  add column payer text check (payer in ('korea_a1', 'raseong', 'geumhwa'));
