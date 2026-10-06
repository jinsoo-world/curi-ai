-- 이번 달(한국 시간) AI 비용 합계(원). 봇 얼굴 만들기의 예산 스위치가 읽는다. 서버(service role)만 부른다.
create or replace function public.llm_cost_krw_month()
returns numeric
language sql
stable
set search_path = public
as $$
    select coalesce(sum(cost_krw), 0)
    from public.llm_usage
    where created_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
$$;

revoke all on function public.llm_cost_krw_month() from public, anon, authenticated;
grant execute on function public.llm_cost_krw_month() to service_role;
