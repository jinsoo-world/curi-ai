-- 서버 열쇠(service_role)가 못 건드리던 표에 권한 부여 (대표 승인 2026-10-05).
-- 이 표들은 service_role 권한이 없거나(analytics_events, conversation_signals, voice_usage, kakao_*, marketing_consent_log, credits)
-- 읽기·쓰기만 있어(app_events, visit_logs) 회원 탈퇴가 지우기에서 막히고 서버 기록도 조용히 실패했다.
-- 권한만 준다. 데이터는 바꾸지 않는다. 여러 번 실행해도 안전하다.
-- RLS 는 그대로다(service_role 은 원래 RLS 를 건너뛴다). anon·authenticated 권한은 건드리지 않는다.
do $$
declare t text;
begin
  foreach t in array array[
    'analytics_events', 'app_events', 'conversation_signals', 'visit_logs', 'voice_usage',
    'kakao_share_logs', 'kakao_unlink_logs', 'marketing_consent_log', 'credits'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant all on table public.%I to service_role', t);
    end if;
  end loop;
  -- 보기(view)와 집계 표는 읽기만
  foreach t in array array['credit_balances', 'mv_daily_stats', 'mv_mentor_stats', 'mv_user_segments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select on table public.%I to service_role', t);
    end if;
  end loop;
end $$;
