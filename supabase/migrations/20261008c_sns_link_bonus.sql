-- SNS, 블로그 링크 연동 보너스 (대표 승인 0928 23:29)
-- 온보딩과 설정에서 받은 내 링크를 저장하고, 읽기에 성공해 자료가 1건 이상 들어가면 클로버 50개를 계정당 한 번만 준다.
-- 중복 지급 막기: sns_link_bonuses.user_id 기본 키 + credit_transactions 의 sns_link_bonus 종류 부분 유일 색인.
-- 지급은 기존 적립 경로(클로버_더하기 + credit_transactions 기록)를 한 함수 안에서 한 번에 한다.
-- 서버 전용: 손님, 로그인 회원 역할은 직접 읽고 쓰지 못한다 (service_role 만).

create table if not exists public.user_sns_links (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    url text not null,
    platform text not null,
    status text not null default 'pending' check (status in ('read', 'pending', 'failed')),
    mentor_id uuid,
    feed_id uuid,
    added_count integer not null default 0,
    note text,
    source text not null default 'settings' check (source in ('onboarding', 'settings')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, url)
);
create index if not exists user_sns_links_user_idx on public.user_sns_links (user_id, created_at desc);

create table if not exists public.sns_link_bonuses (
    user_id uuid primary key references public.users(id) on delete cascade,
    link_id uuid references public.user_sns_links(id) on delete set null,
    clovers integer not null,
    balance_after integer,
    created_at timestamptz not null default now()
);

create unique index if not exists credit_transactions_sns_link_bonus_once
    on public.credit_transactions (user_id) where type = 'sns_link_bonus';

alter table public.user_sns_links enable row level security;
alter table public.sns_link_bonuses enable row level security;
revoke all on public.user_sns_links from anon, authenticated;
revoke all on public.sns_link_bonuses from anon, authenticated;
grant select, insert, update, delete on public.user_sns_links to service_role;
grant select, insert, update, delete on public.sns_link_bonuses to service_role;

-- 한 번만 지급. 이미 받았으면 null. 성공하면 새 잔액
create or replace function public.grant_sns_link_bonus(p_user uuid, p_link uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    claimed uuid;
    new_balance integer;
begin
    if p_amount is null or p_amount <= 0 or p_amount > 100 then
        raise exception 'bad amount';
    end if;
    insert into public.sns_link_bonuses (user_id, link_id, clovers)
    values (p_user, p_link, p_amount)
    on conflict (user_id) do nothing
    returning user_id into claimed;
    if claimed is null then
        return null;
    end if;
    new_balance := public."클로버_더하기"(p_user, p_amount);
    if new_balance < 0 then
        raise exception 'user not found';
    end if;
    insert into public.credit_transactions (user_id, amount, balance_after, type, description)
    values (p_user, p_amount, new_balance, 'sns_link_bonus', '내 글 연동 보너스');
    update public.sns_link_bonuses set balance_after = new_balance where user_id = p_user;
    return new_balance;
end $$;

revoke all on function public.grant_sns_link_bonus(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.grant_sns_link_bonus(uuid, uuid, integer) to service_role;
