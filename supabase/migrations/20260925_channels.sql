-- ============================================================
-- 2026-09-25 그룹 채팅 표 3개 — 여러 봇이 한 방에서 나와 이야기한다.
--
-- 개념:
--   방(channel)        = 내가 만든 그룹 채팅방 하나. 주인은 나 한 사람.
--   멤버(channel_members) = 그 방에 들어 있는 내 봇들(mentors 의 id).
--   말(channel_messages)  = 방에 쌓이는 말. 사람이 한 말과 봇이 한 말이 섞여 있다.
--
-- 안전 규칙(그록봇 안티패턴 ㉟ = 봇들이 서로 답하다 끝없이 돈다):
--   사람 말 한 번에 봇은 최대 2번만 말한다. 그 규칙은 코드(domains/os/channels.ts)에 있다.
--
-- 원칙: RLS 켬 + 본인 행만. 서버(service_role)는 RLS 를 우회하므로 API 에서 user_id 를 반드시 검사한다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

-- 1) 방
CREATE TABLE IF NOT EXISTS public.channels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '내 팀',
  kind       TEXT NOT NULL DEFAULT 'group' CHECK (kind IN ('group')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS channels_user_idx ON public.channels (user_id, created_at);
COMMENT ON TABLE public.channels IS '그룹 채팅방. 주인 한 사람 + 봇 여러 명';

-- 2) 방 멤버 (봇)
CREATE TABLE IF NOT EXISTS public.channel_members (
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  mentor_id  UUID NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel_id, mentor_id)
);
COMMENT ON TABLE public.channel_members IS '방에 들어 있는 봇. 내 팀(team_bots)에 있는 봇만 넣는다(API 에서 검사)';

-- 3) 방에 쌓이는 말
CREATE TABLE IF NOT EXISTS public.channel_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('user', 'bot')),
  mentor_id   UUID REFERENCES public.mentors(id) ON DELETE SET NULL,   -- 봇이 한 말이면 누구인지
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS channel_messages_room_idx ON public.channel_messages (channel_id, created_at);
COMMENT ON TABLE public.channel_messages IS '그룹방의 말. 봇→봇 답은 화면에서 「보낸 사람 ○○」 로 보인다';

-- ---------- RLS: 전부 켬, 내 방만 ----------
ALTER TABLE public.channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own channels" ON public.channels;
CREATE POLICY "own channels" ON public.channels
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 멤버·말은 「그 방이 내 방인가」로 가른다
DROP POLICY IF EXISTS "own channel_members" ON public.channel_members;
CREATE POLICY "own channel_members" ON public.channel_members
  FOR ALL USING (EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "own channel_messages" ON public.channel_messages;
CREATE POLICY "own channel_messages" ON public.channel_messages
  FOR ALL USING (EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_id AND c.user_id = auth.uid()));
