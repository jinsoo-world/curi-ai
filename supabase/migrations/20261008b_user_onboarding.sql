-- 가입 온보딩 6화면 (대표 승인 0928 23:15 「온보딩 고쳐, 데이터 저장되도록」)
-- 회원당 한 행. 새 가입자만 채운다 (기존 회원에게 강제하지 않는다).
-- 약관 동의 시각, 알게 된 경로, 초대 코드 귀속, 맡길 일, 나이대, 강의나 모임 운영 여부,
-- 들어온 길(기기, 운영체제, 앱 여부, utm, referrer)을 서버가 저장한다.
-- 서버 전용 표: 손님, 로그인 회원 역할은 직접 읽고 쓰지 못한다 (service_role 만).
-- 20261008_signup_surveys 표는 이 표로 대체되어 쓰지 않는다 (지우지 않고 남겨 둔다).

create table if not exists public.user_onboarding (
    user_id uuid primary key references public.users(id) on delete cascade,
    survey_version text not null default 'v1',
    status text not null default 'started' check (status in ('started', 'done', 'skipped')),
    step smallint not null default 0,
    -- 화면 1 약관
    terms_version text,
    age_agreed_at timestamptz,
    terms_agreed_at timestamptz,
    privacy_agreed_at timestamptz,
    marketing_agreed boolean not null default false,
    marketing_agreed_at timestamptz,
    -- 화면 2 알게 된 경로와 초대
    acquisition_source text,
    acquisition_detail text,
    leader_code_entered text,
    referral_code text,
    referral_via text check (referral_via in ('link', 'code')),
    referrer_id uuid references public.users(id) on delete set null,
    -- 화면 3 먼저 맡길 일 (최대 3개)
    use_cases text[] not null default '{}',
    -- 화면 4 나이대(필수), 성별과 업종(선택)
    age_band text,
    gender text,
    occupation text,
    -- 화면 5 강의나 모임
    runs_class_or_group text,
    audience_size_band text,
    org_name text,
    leader_contact_ok boolean not null default false,
    -- 화면 6 첫 봇
    first_bot_mentor_id uuid,
    -- 들어온 길 (서버가 채움)
    device text,
    os text,
    app_shell text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    referrer text,
    landing_path text,
    visitor_id text,
    user_agent text,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    updated_at timestamptz not null default now()
);

create index if not exists user_onboarding_started_idx on public.user_onboarding (started_at desc);
create index if not exists user_onboarding_referrer_idx on public.user_onboarding (referrer_id) where referrer_id is not null;

alter table public.user_onboarding enable row level security;
revoke all on public.user_onboarding from anon, authenticated;
grant select, insert, update, delete on public.user_onboarding to service_role;
