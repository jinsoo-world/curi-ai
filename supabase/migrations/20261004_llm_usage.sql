-- 요청마다 모델 원가와 속도 기록 (대표 결정 0928)
-- 서버(service role)만 쓴다. RLS 켜고 정책 없음 = anon, authenticated 는 못 본다.
-- cost_krw 는 추정값 (src/domains/llm/prices.ts 가격표와 환율). 실제 청구는 각 회사 콘솔이 기준.
-- 덧붙이기만 한다 (새 표, 새 뷰, 새 색인).

create table if not exists public.llm_usage (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    route text not null,
    kind text not null,
    provider text,
    model text not null,
    user_id uuid,
    mentor_id uuid,
    channel_id uuid,
    input_tokens integer,
    output_tokens integer,
    tokens_estimated boolean not null default false,
    ttft_ms integer,
    latency_ms integer,
    cost_krw numeric(14, 4),
    fallback boolean not null default false,
    cache_hit boolean not null default false,
    ok boolean not null default true,
    error text,
    meta jsonb
);

create index if not exists llm_usage_created_at_idx on public.llm_usage (created_at desc);
create index if not exists llm_usage_user_created_idx on public.llm_usage (user_id, created_at desc);
create index if not exists llm_usage_route_created_idx on public.llm_usage (route, created_at desc);

alter table public.llm_usage enable row level security;
revoke all on table public.llm_usage from anon, authenticated;

-- 사람별 하루 합계 (한국 시간 기준 날짜). 관리자(service role)만 본다.
create or replace view public.llm_usage_daily with (security_invoker = true) as
select
    (created_at at time zone 'Asia/Seoul')::date as day_kst,
    user_id,
    count(*) as calls,
    count(*) filter (where cache_hit) as cache_hits,
    count(*) filter (where fallback) as fallbacks,
    count(*) filter (where not ok) as errors,
    coalesce(sum(input_tokens), 0) as input_tokens,
    coalesce(sum(output_tokens), 0) as output_tokens,
    round(coalesce(sum(cost_krw), 0), 2) as cost_krw_estimate
from public.llm_usage
group by 1, 2;

-- 사람별 한 달 합계
create or replace view public.llm_usage_monthly with (security_invoker = true) as
select
    to_char(created_at at time zone 'Asia/Seoul', 'YYYY-MM') as month_kst,
    user_id,
    count(*) as calls,
    count(*) filter (where cache_hit) as cache_hits,
    count(*) filter (where fallback) as fallbacks,
    count(*) filter (where not ok) as errors,
    coalesce(sum(input_tokens), 0) as input_tokens,
    coalesce(sum(output_tokens), 0) as output_tokens,
    round(coalesce(sum(cost_krw), 0), 2) as cost_krw_estimate
from public.llm_usage
group by 1, 2;

revoke all on table public.llm_usage_daily from anon, authenticated;
revoke all on table public.llm_usage_monthly from anon, authenticated;

comment on table public.llm_usage is '모델 호출 한 번에 한 줄. cost_krw 는 추정값 (prices.ts). 서버 전용';
comment on view public.llm_usage_daily is '사람별 하루(KST) 모델 비용 추정 합계. 관리자 전용';
comment on view public.llm_usage_monthly is '사람별 한 달(KST) 모델 비용 추정 합계. 관리자 전용';
