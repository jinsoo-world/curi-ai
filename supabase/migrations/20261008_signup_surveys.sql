-- 가입 설문 한 장 (대표 승인 0928). 1인 사업가 대상.
-- 한 사람 한 줄. 끝까지 답했으면 status done, 건너뛰었으면 skipped (다시 안 띄운다).
-- 답과 함께 들어온 길(기기, 운영체제, 앱 여부, utm, referrer, 추천 코드)을 서버가 채운다.
-- 서버(service role)만 쓴다. RLS 켜고 정책 없음 = anon, authenticated 는 못 본다.
-- 덧붙이기만 한다 (새 표, 새 색인).

create table if not exists public.signup_surveys (
    user_id uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    status text not null check (status in ('done', 'skipped')),
    -- 1. 어떻게 알게 됐나: ai_chatbot, search, youtube, insta_threads, referral, other
    found_via text,
    found_via_other text,
    ref_code text,
    -- 2. 무슨 일: lecture_coaching, shop, store, freelancer, content, other
    business text,
    business_other text,
    -- 3. 봇이 먼저 도울 일: customer, promo, schedule, quote, docs
    first_help text,
    -- 4. 강의나 모임을 운영하나
    runs_community boolean,
    -- 자동으로 채우는 칸
    device text,        -- mobile, pc
    os text,            -- ios, android, windows, mac, linux, other
    app_shell text,     -- ios_app, android_app, web
    utm_source text,
    utm_medium text,
    utm_campaign text,
    referrer text,
    landing_path text,
    visitor_id text,
    user_agent text
);

create index if not exists signup_surveys_created_idx on public.signup_surveys (created_at desc);

alter table public.signup_surveys enable row level security;
revoke all on table public.signup_surveys from anon, authenticated;
grant all on table public.signup_surveys to service_role;
