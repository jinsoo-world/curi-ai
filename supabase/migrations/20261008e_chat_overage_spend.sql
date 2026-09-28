-- 한도 넘긴 대화의 클로버 차감 (요금 정책 rev5, 대표 승인 0928 23:53)
-- 잔액 확인, 차감, 거래 기록을 한 번에 한다. 잔액이 모자라면 아무것도 안 바꾸고 -1.
-- 결제, 환불, 토스와 무관. 대화 라우트가 월 한도를 다 쓴 뒤에만 부른다.
create or replace function public.spend_clovers_for_chat(p_user uuid, p_amount int, p_mentor uuid, p_desc text)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_left int;
begin
  if p_amount is null or p_amount <= 0 then
    return -1;
  end if;
  update public.users set clovers = clovers - p_amount
   where id = p_user and coalesce(clovers, 0) >= p_amount
   returning clovers into v_left;
  if v_left is null then
    return -1;
  end if;
  insert into public.credit_transactions (user_id, amount, balance_after, type, description, mentor_id)
  values (p_user, -p_amount, v_left, 'chat_usage', coalesce(p_desc, '한도 넘긴 대화'),
          case when p_mentor is not null and exists (select 1 from public.mentors m where m.id = p_mentor) then p_mentor else null end);
  return v_left;
end
$$;

revoke all on function public.spend_clovers_for_chat(uuid, int, uuid, text) from public, anon, authenticated;
grant execute on function public.spend_clovers_for_chat(uuid, int, uuid, text) to service_role;
