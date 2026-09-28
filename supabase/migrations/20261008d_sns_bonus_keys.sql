-- SNS 링크 보너스: 같은 블로그, 채널 주소로 여러 계정이 보너스를 받지 못하게 (대표 결정 0928 23:53)
-- 더하기만 한다. 서버(service_role) 전용.

create table if not exists public.sns_bonus_keys (
    canonical_key text primary key,
    user_id uuid not null,
    created_at timestamptz not null default now()
);
alter table public.sns_bonus_keys enable row level security;
revoke all on public.sns_bonus_keys from anon, authenticated;
grant select, insert, update, delete on public.sns_bonus_keys to service_role;

-- 결과: 새 잔액 = 지급, null = 이 계정은 이미 받음, -1 = 같은 주소로 다른 계정이 이미 받음
create or replace function public.grant_sns_link_bonus_keyed(p_user uuid, p_link uuid, p_amount integer, p_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    owner uuid;
begin
    if p_key is null or length(p_key) < 3 or length(p_key) > 300 then
        raise exception 'bad key';
    end if;
    insert into public.sns_bonus_keys (canonical_key, user_id)
    values (p_key, p_user)
    on conflict (canonical_key) do nothing;
    select user_id into owner from public.sns_bonus_keys where canonical_key = p_key;
    if owner is distinct from p_user then
        return -1;
    end if;
    return public.grant_sns_link_bonus(p_user, p_link, p_amount);
end $$;

revoke all on function public.grant_sns_link_bonus_keyed(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.grant_sns_link_bonus_keyed(uuid, uuid, integer, text) to service_role;
