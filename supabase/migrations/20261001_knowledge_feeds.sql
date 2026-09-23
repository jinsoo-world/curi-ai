-- ============================================================
-- 2026-10-01 계정 연결(knowledge_feeds) 표 1개 신설 + knowledge_sources 에 feed_id 칸 하나 추가.
--
-- 계정 연결 = 크리에이터가 유튜브 채널, 웹사이트, 팟캐스트/Substack 주소를 봇에 한 번 붙이면
--             새로 올라온 공개 글을 매일 자료로 가져온다(공개 글만, 공식 방법만).
--             X, Instagram, TikTok 은 모양만 있다(열쇠 등록 전까지 status='paused').
--
-- 소유 사슬(20260924_knowledge_owner_rls.sql 과 같다):
--   knowledge_feeds.mentor_id → mentors.id → mentors.creator_id → creator_profiles.id → creator_profiles.user_id
--   user_id 칸 = 연결한 사람(team_bots.user_id). 간단한 확인용으로 따로 둔다.
--
-- 연결을 끊어도 이미 가져온 자료는 남는다(기본). 그래서 feed_id 는 ON DELETE SET NULL.
-- 「가져온 자료도 같이 지우기」를 고르면 앱 코드가 자료를 먼저 지운다.
--
-- 서버 코드(service_role)는 RLS 를 건너뛴다. 그래서 API 는 assertBotOwned 로 주인을 먼저 확인한다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행. 여러 번 실행해도 안전.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.knowledge_feeds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  mentor_id       UUID NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL
                  CHECK (kind IN ('youtube', 'website', 'podcast', 'substack', 'x', 'instagram', 'tiktok')),
  handle_or_url   TEXT NOT NULL,                        -- 크리에이터가 적은 그대로(@핸들, 사이트 주소, RSS 주소)
  status          TEXT NOT NULL DEFAULT 'connected'
                  CHECK (status IN ('connected', 'error', 'paused')),
  last_synced_at  TIMESTAMPTZ,
  last_error      TEXT,                                 -- 사람에게 그대로 보여 줄 한 줄
  item_count      INT NOT NULL DEFAULT 0,               -- 이 연결로 만든 자료 수
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_feeds_mentor_idx ON public.knowledge_feeds (mentor_id, created_at DESC);
-- 매일 크론이 「오래 안 가져온 것부터」 집는 길
CREATE INDEX IF NOT EXISTS knowledge_feeds_due_idx    ON public.knowledge_feeds (status, last_synced_at NULLS FIRST);

-- 자료가 어느 연결에서 왔는지. 대부분의 옛 자료는 비어 있다
ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS feed_id UUID REFERENCES public.knowledge_feeds(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS knowledge_sources_feed_idx ON public.knowledge_sources (feed_id);
-- 같은 글을 두 번 넣지 않게 확인하는 길(봇 + 원래 주소)
CREATE INDEX IF NOT EXISTS knowledge_sources_mentor_url_idx ON public.knowledge_sources (mentor_id, original_url);

COMMENT ON TABLE public.knowledge_feeds IS '계정 연결. 공개 글만 공식 방법으로 매일 가져온다. X/Instagram/TikTok 은 열쇠 등록 전까지 paused';

-- ---------- RLS: 켬, 그 봇의 주인만 ----------
ALTER TABLE public.knowledge_feeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_knowledge_feeds" ON public.knowledge_feeds;
CREATE POLICY "owner_all_knowledge_feeds" ON public.knowledge_feeds
  FOR ALL
  USING (auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM public.mentors m
      JOIN public.creator_profiles cp ON cp.id = m.creator_id
      WHERE m.id = knowledge_feeds.mentor_id AND cp.user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM public.mentors m
      JOIN public.creator_profiles cp ON cp.id = m.creator_id
      WHERE m.id = knowledge_feeds.mentor_id AND cp.user_id = auth.uid()));

GRANT SELECT ON public.knowledge_feeds TO authenticated;
GRANT ALL    ON public.knowledge_feeds TO service_role;
