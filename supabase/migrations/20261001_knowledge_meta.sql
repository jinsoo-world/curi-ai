-- ============================================================
-- 2026-10-01 자료(지식) 메타 칸 추가 — 델파이급 Knowledge 보강 갈래B
--
-- 새 칸 6개 (전부 knowledge_sources):
--   name          자료 이름 (없으면 title 을 그대로 쓴다)
--   context       이 자료가 무엇인지 한 줄 설명 (사람이 적음)
--   author_is_me  내(봇 주인)가 직접 쓴 글인가
--   citation_url  인용·출처 주소 (원문 주소와 다를 수 있다)
--   source_kind   넣은 방식 세부: file/url/youtube/text/qa/note/csv/fix — source_type(4종)보다 잘게 가른다
--   fetched_at    이 자료를 가져온 시각
--
-- 전부 ADD COLUMN IF NOT EXISTS — 여러 번 실행해도 안전.
-- 칸이 없어도(마이그레이션 아직 안 돌았을 때) 앱이 안 깨지게: 서버 코드가 42703(칸 없음) 오류를 잡아
-- 메타 없이 한 번 더 저장/조회한다 (src/domains/knowledge/actions.ts, src/domains/os/knowledge.ts).
--
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행.
-- ============================================================

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS context TEXT,
  ADD COLUMN IF NOT EXISTS author_is_me BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS citation_url TEXT,
  ADD COLUMN IF NOT EXISTS source_kind TEXT,
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;

COMMENT ON COLUMN public.knowledge_sources.name         IS '자료 이름 (없으면 title 을 그대로 쓴다)';
COMMENT ON COLUMN public.knowledge_sources.context      IS '이 자료가 무엇인지 한 줄 설명 (사람이 적음)';
COMMENT ON COLUMN public.knowledge_sources.author_is_me IS '내(봇 주인)가 직접 쓴 글인가';
COMMENT ON COLUMN public.knowledge_sources.citation_url IS '인용·출처 주소 (원문 주소와 다를 수 있다)';
COMMENT ON COLUMN public.knowledge_sources.source_kind  IS '넣은 방식 세부: file/url/youtube/text/qa/note/csv/fix';
COMMENT ON COLUMN public.knowledge_sources.fetched_at   IS '이 자료를 가져온 시각 (링크=읽은 시각, 손으로 쓴 건=넣은 시각)';
