-- ============================================================
-- 2026-10-22 knowledge_feeds 잠금 (PR #53 보안 검토. 운영에는 1006 에 같은 SQL 을 먼저 실행함 → 기록용, 여러 번 실행해도 안전)
--
-- 왜: 계정 연결 줄(knowledge_feeds)을 화면이 회원 열쇠로 직접 읽거나 쓰는 코드가 없다(전수 확인: 전부 서버 관리자 열쇠).
--   회원 열쇠로 열어 두면 REST 로 sns_slot·handle_or_url·status 를 바꿔 크론이 남의 주소를 읽게 하거나 상한을 비켜 갈 수 있다.
-- 원칙: RLS 켬 + 정책 0개 + anon·authenticated 권한 전부 회수 + service_role 만. 서버는 API 에서 봇 주인을 먼저 확인한다.
-- 데이터는 바꾸지 않는다.
-- ============================================================

begin;

alter table public.knowledge_feeds enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'knowledge_feeds' loop
    execute format('drop policy %I on public.knowledge_feeds', p.policyname);
  end loop;
end $$;

revoke all on table public.knowledge_feeds from anon, authenticated;
grant all on table public.knowledge_feeds to service_role;

commit;
