-- ============================================================
-- 2026-10-22 봇 「내 SNS 연결」 (대표 확정 1006): 계정 연결(knowledge_feeds) 줄에 sns_slot 칸 하나.
--
-- 왜 새 표가 아니라 칸 하나인가
--   SNS 배우기는 이미 있는 「계정 연결」(같은 글 건너뛰기, 자료 칸 규칙, 매일 크론 /api/cron/feeds)을 그대로 쓴다.
--   어느 연결이 SNS 칸(인스타그램/블로그/유튜브/큐리어스)인지만 알면 된다 = sns_slot.
--   sns_slot 이 붙은 연결은 SNS 규칙으로 돈다: 요금제별 SNS 자료 상한, 유튜브는 공개 피드의 제목과 설명만(자막 안 씀).
--   공개 링크(소개 화면)는 이미 있는 mentors.links 에 넣는다.
--
-- 권한: 이 파일은 권한을 바꾸지 않는다. 잠금은 20261022_knowledge_feeds_lock.sql (service_role 만).
--   서버 코드는 service_role 로 쓰고, API 가 봇 주인을 먼저 확인한다(resolveOwnedBot → assertBotOwned).
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행. 여러 번 실행해도 안전. 데이터는 바꾸지 않는다.
--   코드는 이 칸이 없어도 깨지지 않는다(읽기는 옛 칸으로 다시 읽고, 저장은 「준비 중」 503).
-- ============================================================

begin;

alter table public.knowledge_feeds
  add column if not exists sns_slot text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'knowledge_feeds_sns_slot_check' and conrelid = 'public.knowledge_feeds'::regclass
  ) then
    alter table public.knowledge_feeds
      add constraint knowledge_feeds_sns_slot_check
      check (sns_slot is null or sns_slot in ('instagram', 'blog', 'youtube', 'curious'));
  end if;
end $$;

-- 봇 하나에 같은 SNS 칸은 하나만.
-- 조건 없는 고유 색인이어야 저장 창구의 upsert(on conflict (mentor_id, sns_slot))가 이 색인을 쓴다.
-- sns_slot 이 빈(NULL) 일반 연결 줄끼리는 서로 겹침으로 치지 않는다(Postgres 기본).
drop index if exists public.knowledge_feeds_mentor_sns_slot_uq;   -- 처음 버전(조건 있는 색인)을 실행했으면 바꾼다
create unique index if not exists knowledge_feeds_mentor_sns_slot_key
  on public.knowledge_feeds (mentor_id, sns_slot);

comment on column public.knowledge_feeds.sns_slot is
  '봇 「내 SNS 연결」 칸(instagram/blog/youtube/curious). 비어 있으면 일반 계정 연결';

-- 권한은 바꾸지 않지만 서버 열쇠가 확실히 쓰게 (20261015_service_role_grants 와 같은 원칙)
grant all on table public.knowledge_feeds to service_role;

commit;
