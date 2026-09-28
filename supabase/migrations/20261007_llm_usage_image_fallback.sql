-- llm_usage 에 칸 셋 덧붙이기 (대표 결정 0928, 이미지 기록과 솔라 전환 준비)
--   fallback_reason = 솔라 대신 Gemini 가 답한 까닭 (missing_key, auth, timeout, rate_limit, server, empty, image, forced, other)
--   image_count     = 이번에 만든 사진 장수 (kind = 'image')
--   search_queries  = Gemini 가 구글 검색을 몇 번 했나 (검색 도구 비용 확인용)
-- 덧붙이기만 한다 (새 칸, 새 색인, 새 함수). 기존 줄과 칸은 그대로다.

alter table public.llm_usage add column if not exists fallback_reason text;
alter table public.llm_usage add column if not exists image_count integer;
alter table public.llm_usage add column if not exists search_queries integer;

create index if not exists llm_usage_kind_created_idx on public.llm_usage (kind, created_at desc);

-- 오늘(한국 시간) 만든 사진 장수. p_route 를 주면 그 입구만 센다. 실패한 줄은 세지 않는다.
create or replace function public.llm_image_count_today(p_route text default null)
returns integer
language sql
stable
set search_path = public
as $$
    select coalesce(sum(coalesce(image_count, 1)), 0)::integer
    from public.llm_usage
    where kind = 'image'
      and ok
      and created_at >= ((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul')
      and (p_route is null or route = p_route);
$$;

revoke all on function public.llm_image_count_today(text) from public, anon, authenticated;
-- 서버(service role)만 부른다 (따로 적용: 20261007b_llm_image_count_grant)
grant execute on function public.llm_image_count_today(text) to service_role;
