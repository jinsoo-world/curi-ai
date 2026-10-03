-- ============================================================
-- 2026-10-03 자료 넣기 보강: 원문 보관 칸 + 조각 메타 (PR feat/ingest-chunking-1003)
--
-- knowledge_sources (원문 원장, content 칸에 전문은 이미 있다)
--   content_hash  같은 글 열쇠 (띄어쓰기 무시 sha256). 같은 봇에 같은 글을 두 번 넣지 않는다
--   char_count    글자 수
--   published_at  글이 쓰인 날 (블로그 글 날짜, 영상 올린 날)
-- knowledge_chunks
--   meta          조각마다 {pos:"3/12", heading, t:"[분:초] 영상 시각", title, url, published_at}
--
-- 새 표 없음 = 두 표의 RLS(봇 주인만, 20260924_knowledge_owner_rls.sql)를 그대로 따른다.
-- 중복 막기는 앱에서 한다 (옛 자료에 같은 글이 이미 있을 수 있어 UNIQUE 를 걸지 않는다).
-- 칸이 없어도 앱은 안 깨진다: 서버가 42703(칸 없음)을 잡아 이 칸들만 빼고 다시 저장한다 (src/domains/knowledge/actions.ts).
-- 전부 IF NOT EXISTS = 여러 번 실행해도 안전. 적용: Supabase SQL 편집기 (대표 승인 후).
-- ============================================================

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS char_count INTEGER,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS meta JSONB;

CREATE INDEX IF NOT EXISTS knowledge_sources_mentor_hash_idx
  ON public.knowledge_sources (mentor_id, content_hash) WHERE content_hash IS NOT NULL;

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks  ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.knowledge_sources.content_hash IS '같은 글 열쇠 (띄어쓰기 무시 sha256). 중복 막기용';
COMMENT ON COLUMN public.knowledge_sources.char_count   IS '원문 글자 수';
COMMENT ON COLUMN public.knowledge_sources.published_at IS '글이 쓰인 날 (블로그 글 날짜, 영상 올린 날)';
COMMENT ON COLUMN public.knowledge_chunks.meta          IS '조각 메타 {pos, heading, t, title, url, published_at}';
