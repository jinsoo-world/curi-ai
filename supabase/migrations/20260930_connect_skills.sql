-- ============================================================
-- 2026-09-30 연결(/os/connect) = 서비스 13개 + 스킬.
--
--   1) connectors.kind 허용 글자를 5개 → 13개로 넓힌다(표는 그대로, 제약만 바꾼다).
--      사용자 본인 계정 로그인(OAuth)으로 붙인 토큰 JSON 이 secret_encrypted 에 잠겨 들어간다(같은 자물쇠).
--   2) bot_skills = 사용자가 깃허브에서 가져온 스킬 글(SKILL.md 또는 README.md). 봇 지침 뒤에 얹는다.
--
-- 원칙: RLS 켬 + 본인 행만. 서버는 service_role 로 RLS 를 우회하니 API 에서 user_id 를 꼭 검사한다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

-- ---------- 1) connectors.kind 13개 ----------
ALTER TABLE public.connectors DROP CONSTRAINT IF EXISTS connectors_kind_check;
ALTER TABLE public.connectors ADD CONSTRAINT connectors_kind_check CHECK (kind IN (
  'notion', 'slack', 'kakao', 'gmail', 'google_calendar', 'naver_calendar', 'naver_blog',
  'zoom', 'threads', 'youtube', 'github', 'instagram', 'curious'
));
COMMENT ON TABLE public.connectors IS '밖의 서비스 연결 13종. 열쇠(토큰 JSON)는 AES-256-GCM 으로 잠가서 넣는다. meta.hint 에는 계정 힌트(jin@…)만';

-- ---------- 2) bot_skills ----------
CREATE TABLE IF NOT EXISTS public.bot_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                              -- 스킬 이름(SKILL.md 첫 제목 또는 저장소 이름)
  source_url  TEXT NOT NULL,                              -- 사용자가 붙인 깃허브 주소(github.com 만)
  content     TEXT NOT NULL CHECK (length(content) <= 204800),  -- 스킬 글(200KB 상한). 지침이 아니라 「자료」로 취급한다
  enabled     BOOLEAN NOT NULL DEFAULT true,
  -- 어느 봇에 붙이나 = mentors.id 목록. 비어 있으면 내 봇 전부
  mentor_ids  UUID[] NOT NULL DEFAULT '{}'::uuid[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_skills_user_idx ON public.bot_skills (user_id, enabled);

COMMENT ON TABLE  public.bot_skills            IS '깃허브에서 가져온 봇 스킬 글. 봇 지침 뒤에 [스킬: 이름] 으로 얹는다(자료 울타리 안, 승인 카드는 못 넘는다)';
COMMENT ON COLUMN public.bot_skills.mentor_ids IS '붙일 봇(mentors.id). 빈 배열 = 내 봇 전부';

ALTER TABLE public.bot_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_skills_select_own" ON public.bot_skills;
CREATE POLICY "bot_skills_select_own" ON public.bot_skills
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bot_skills_insert_own" ON public.bot_skills;
CREATE POLICY "bot_skills_insert_own" ON public.bot_skills
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bot_skills_update_own" ON public.bot_skills;
CREATE POLICY "bot_skills_update_own" ON public.bot_skills
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bot_skills_delete_own" ON public.bot_skills;
CREATE POLICY "bot_skills_delete_own" ON public.bot_skills
  FOR DELETE USING (auth.uid() = user_id);
