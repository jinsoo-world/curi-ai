-- ============================================================
-- 2026-10-01 드라이브·노션 자료 동기화(갈래 G) — 표 1개 신설 + connectors.kind 넓히기.
--
--   knowledge_syncs = 「이 폴더(구글 드라이브)/이 페이지(노션)를 하루에 한 번 봇에게 넣어라」는 등록.
--   실제로 가져온 글은 기존 knowledge_sources/knowledge_chunks 에 그대로 쌓인다(새 표를 만들지 않는다).
--
-- 원칙: RLS 켬 + 본인 행만. 서버는 service_role 로 RLS 를 우회하니 API 에서 user_id 를 꼭 검사한다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

-- ---------- 1) connectors.kind 에 google_drive 추가 ----------
ALTER TABLE public.connectors DROP CONSTRAINT IF EXISTS connectors_kind_check;
ALTER TABLE public.connectors ADD CONSTRAINT connectors_kind_check CHECK (kind IN (
  'notion', 'slack', 'kakao', 'gmail', 'google_calendar', 'google_drive', 'naver_calendar', 'naver_blog',
  'zoom', 'threads', 'youtube', 'github', 'instagram', 'curious'
));

-- ---------- 2) knowledge_syncs ----------
CREATE TABLE IF NOT EXISTS public.knowledge_syncs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mentor_id          UUID NOT NULL,                                     -- 어느 봇에게 넣을지 (team_bots.mentor_id 와 같은 값. FK 는 안 건다 — team_bots 가 아직 없는 환경도 있다)
  provider           TEXT NOT NULL CHECK (provider IN ('google_drive', 'notion')),
  folder_or_page_id  TEXT NOT NULL,                                     -- 드라이브 = 폴더 id, 노션 = 페이지 id
  name               TEXT NOT NULL DEFAULT '',                          -- 화면에 보여 줄 이름(폴더 이름 / 페이지 제목)
  last_synced_at     TIMESTAMPTZ,                                       -- 마지막으로 「다 봤다」고 표시한 시각. 이 시각 이후 바뀐 것만 다음에 가져온다
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'error')),
  last_error         TEXT,                                              -- 실패 이유(사람 말). 성공하면 비운다
  item_count         INTEGER NOT NULL DEFAULT 0,                        -- 가장 최근 동기화에서 봇에게 새로 넣은 자료 수
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, mentor_id, provider, folder_or_page_id)
);

CREATE INDEX IF NOT EXISTS knowledge_syncs_user_idx ON public.knowledge_syncs (user_id, mentor_id);
CREATE INDEX IF NOT EXISTS knowledge_syncs_due_idx ON public.knowledge_syncs (status, last_synced_at);

COMMENT ON TABLE  public.knowledge_syncs                     IS '구글 드라이브 폴더·노션 페이지를 봇 자료로 하루 1번 동기화하는 등록표. 실제 글은 knowledge_sources 에 쌓인다';
COMMENT ON COLUMN public.knowledge_syncs.folder_or_page_id   IS '드라이브 = 폴더 id, 노션 = 페이지 id';
COMMENT ON COLUMN public.knowledge_syncs.last_synced_at      IS '이 시각 이후 수정된 파일·페이지만 다음 동기화 때 다시 읽는다(수정시각 비교)';
COMMENT ON COLUMN public.knowledge_syncs.item_count          IS '가장 최근 실행에서 새로 넣은 자료 수(누적 아님)';

ALTER TABLE public.knowledge_syncs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_syncs_select_own" ON public.knowledge_syncs;
CREATE POLICY "knowledge_syncs_select_own" ON public.knowledge_syncs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "knowledge_syncs_insert_own" ON public.knowledge_syncs;
CREATE POLICY "knowledge_syncs_insert_own" ON public.knowledge_syncs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "knowledge_syncs_update_own" ON public.knowledge_syncs;
CREATE POLICY "knowledge_syncs_update_own" ON public.knowledge_syncs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "knowledge_syncs_delete_own" ON public.knowledge_syncs;
CREATE POLICY "knowledge_syncs_delete_own" ON public.knowledge_syncs
  FOR DELETE USING (auth.uid() = user_id);

-- service_role(서버)은 RLS 를 우회하지만, 혹시 anon/authenticated 기본 권한이 막혀 있는 환경을 위해 명시적으로 한 번 더 연다
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_syncs TO authenticated;
GRANT ALL ON public.knowledge_syncs TO service_role;
