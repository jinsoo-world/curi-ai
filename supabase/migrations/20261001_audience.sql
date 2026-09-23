-- ============================================================
-- 2026-10-01 갈래 I — Audience(누가 이 봇과 대화할 수 있나) + 한도 + Access Groups.
-- 표 4개 신설. 기존 표는 건드리지 않는다. 표가 없어도 코드는 기본값(내 팀 봇=Just Me, 마켓 공개 봇=Public)으로 동작한다.
--
-- 개념(델파이 문법 그대로):
--   Just Me    = 나만(주인만) 대화할 수 있다.
--   Insiders   = 내가 초대한 사람 · 내 접근 그룹(access_groups)에 든 사람만.
--   Public     = 로그인한 누구나. 마켓(봇 목록)에도 보인다.
--   Anonymous  = 로그인 없이도. 단 공개로 표시된 자료만 답한다(자료 표에 표시 칸이 아직 없어 지금은 전부 허용 — 리스크로 남긴다).
--
--   bot_audience.message_limit_per_week = 이 봇 주인이 정한 「방문자 1인당 주간 한도」.
--     NULL = 정해 둔 게 없다(방문자의 큐리 요금제 한도만 적용). 실제 적용은 두 값 중 작은 쪽
--     (domains/os/audience.ts visitorWeeklyLimit).
--   voice_minutes_per_week = 자리만 만들어 둔다(음성 한도는 이번 갈래 범위 밖. 코드에서 아직 안 쓴다).
--
-- 원칙: RLS 켬 + 본인(owner_user_id) 행만. 서버(service_role)는 RLS 를 우회하므로
--       API 에서 봇 주인이 맞는지(team_bots.user_id 또는 creator_profiles.user_id)를 반드시 검사한다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

-- 1) 봇 하나(mentor_id)의 공개 범위 + 방문자 한도
CREATE TABLE IF NOT EXISTS public.bot_audience (
  mentor_id               UUID PRIMARY KEY REFERENCES public.mentors(id) ON DELETE CASCADE,
  owner_user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  level                   TEXT NOT NULL DEFAULT 'just_me'
                          CHECK (level IN ('just_me', 'insiders', 'public', 'anonymous')),
  message_limit_per_week  INTEGER CHECK (message_limit_per_week IS NULL OR message_limit_per_week >= 0),
  voice_minutes_per_week  INTEGER CHECK (voice_minutes_per_week IS NULL OR voice_minutes_per_week >= 0),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bot_audience_owner_idx ON public.bot_audience (owner_user_id);
COMMENT ON TABLE  public.bot_audience IS '봇마다 누가 대화할 수 있는지 + 방문자 1인당 주간 한도. 행이 없으면 기본값(내 팀 봇=just_me, 마켓 공개 봇=public)';
COMMENT ON COLUMN public.bot_audience.message_limit_per_week IS 'NULL = 정해 둔 게 없다(방문자 요금제 한도만). 실제 적용은 요금제 한도와 이 값 중 작은 쪽';

-- 2) 접근 그룹 (봇 주인이 만든 「초대 명단」 묶음. 이름만 있고 봇 연결은 3번 표에서)
CREATE TABLE IF NOT EXISTS public.access_groups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS access_groups_owner_idx ON public.access_groups (owner_user_id);
COMMENT ON TABLE public.access_groups IS '봇 주인이 만든 초대 명단 묶음(Insiders 그룹)';

-- 3) 그룹 멤버 (이메일로 초대. 가입하면 user_id 로 이어 붙인다)
CREATE TABLE IF NOT EXISTS public.access_group_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  email        TEXT,
  user_id      UUID REFERENCES public.users(id) ON DELETE CASCADE,
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email IS NOT NULL OR user_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS access_group_members_email_idx
  ON public.access_group_members (group_id, lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS access_group_members_user_idx
  ON public.access_group_members (group_id, user_id) WHERE user_id IS NOT NULL;
COMMENT ON TABLE public.access_group_members IS '그룹 멤버. 초대는 이메일로 하고, 그 이메일로 가입해 있으면 user_id 로도 찾는다';

-- 4) 어느 봇이 어느 그룹을 Insiders 로 쓰는지 (다대다)
CREATE TABLE IF NOT EXISTS public.bot_access_groups (
  mentor_id  UUID NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (mentor_id, group_id)
);
COMMENT ON TABLE public.bot_access_groups IS '봇 × 접근 그룹. 봇의 level=insiders 일 때 이 표에 든 그룹의 멤버만 통과';

-- ---------- RLS: 전부 켬, 본인(owner_user_id) 행만 ----------
ALTER TABLE public.bot_audience          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_access_groups     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own bot_audience" ON public.bot_audience;
CREATE POLICY "own bot_audience" ON public.bot_audience
  FOR ALL USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "own access_groups" ON public.access_groups;
CREATE POLICY "own access_groups" ON public.access_groups
  FOR ALL USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "own access_group_members" ON public.access_group_members;
CREATE POLICY "own access_group_members" ON public.access_group_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.access_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.access_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own bot_access_groups" ON public.bot_access_groups;
CREATE POLICY "own bot_access_groups" ON public.bot_access_groups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.access_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.access_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid())
  );

REVOKE ALL ON public.bot_audience, public.access_groups, public.access_group_members, public.bot_access_groups FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_audience, public.access_groups, public.access_group_members, public.bot_access_groups TO authenticated;
GRANT ALL ON public.bot_audience, public.access_groups, public.access_group_members, public.bot_access_groups TO service_role;
