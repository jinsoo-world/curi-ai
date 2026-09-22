-- ============================================================
-- 2026-09-23 에이전트 OS P0 — 표 4개 신설. 기존 표는 건드리지 않는다.
--
-- 개념(그록봇 문법):
--   봇(bot)        = 이름·역할 하나·캐릭터가 있는 AI 팀원.  몸은 기존 mentors 행, 팀 소속·캐릭터는 team_bots.
--   승인 카드      = 봇이 「보내기·게시·구매·이체·삭제·권한 변경·약관 동의」를 하려 할 때 반드시 사람에게 묻는 기록.
--   체크인         = 오늘 기분·에너지·한 일·막힌 일 (칩으로 고름). 트윈의 「기억」 재료.
--   미룬 일        = 다음 한 걸음(Next Step). 며칠 미뤘나가 주간 리포트의 게이지.
-- 원칙: RLS 켬 + 본인 행만. 서버(service_role)는 RLS 를 우회하므로 API 에서 user_id 를 반드시 검사한다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전하게 IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

-- 1) 팀에 속한 봇 (사용자 × 멘토) + 캐릭터·역할·승인 모드
CREATE TABLE IF NOT EXISTS public.team_bots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mentor_id     UUID NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  -- twin = 디지털 나 · chief = 비서실장(내가 매일 말하는 단 한 명) · helper = 도우미
  role          TEXT NOT NULL DEFAULT 'helper' CHECK (role IN ('twin', 'chief', 'helper')),
  -- 캐릭터 = 도형 1 + 색 1 + 눈 2 (그록봇 문법 + 네잎클로버)
  shape         TEXT NOT NULL DEFAULT 'circle' CHECK (shape IN ('circle', 'hex', 'square', 'egg', 'drop', 'clover')),
  color         TEXT NOT NULL DEFAULT 'green'  CHECK (color IN ('orange', 'teal', 'magenta', 'blue', 'brown', 'green', 'yellow', 'white')),
  one_liner     TEXT,                                   -- 한 줄 성격 (명단 이름 아래 칩)
  -- 승인 모드: always_ask = 보내기 전 항상 물어봐(기본) · draft_only = 초안만, 밖으로 안 나감 · auto_safe = 되돌릴 수 있는 일은 알아서(P2)
  approval_mode TEXT NOT NULL DEFAULT 'always_ask' CHECK (approval_mode IN ('always_ask', 'draft_only', 'auto_safe')),
  pinned        BOOLEAN NOT NULL DEFAULT true,
  hidden        BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, mentor_id)
);
CREATE INDEX IF NOT EXISTS team_bots_user_idx ON public.team_bots (user_id, hidden, sort_order);
COMMENT ON TABLE public.team_bots IS '사용자 팀의 봇 명단. 몸(프롬프트·지식)은 mentors, 팀 소속·캐릭터·승인 모드는 여기';

-- 2) 승인 요청 (승인 카드). 봇의 위험 행동은 여기 기록이 pending → allowed 가 되기 전엔 실행되지 않는다.
CREATE TABLE IF NOT EXISTS public.permission_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mentor_id       UUID REFERENCES public.mentors(id) ON DELETE SET NULL,
  session_id      UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  -- 「되돌릴 수 없는 행동」 목록 = 승인선. 여기 없는 행동(조사·요약·초안·정리)은 묻지 않고 끝낸다.
  action_type     TEXT NOT NULL CHECK (action_type IN (
                    'send_message', 'publish', 'purchase', 'transfer', 'delete', 'change_permission', 'accept_terms', 'other')),
  summary         TEXT NOT NULL,                        -- 카드 첫 줄: 「팬 3명에게 답장 보내기」
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- 실제 보낼 내용 미리보기(수신자·본문 등)
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'allowed', 'denied', 'edited_allowed', 'expired')),
  decided_at      TIMESTAMPTZ,
  decided_payload JSONB,                                -- 「고쳐서 허용」일 때 사람이 고친 최종 내용
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS permission_requests_user_status_idx ON public.permission_requests (user_id, status, created_at DESC);
COMMENT ON TABLE public.permission_requests IS '승인 카드 + 감사로그. 삭제하지 않는다(만료는 status=expired)';

-- 3) 오늘 체크인 (칩으로 고름). 하루 한 줄.
CREATE TABLE IF NOT EXISTS public.checkins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day         DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'Asia/Seoul')::date),
  mood        SMALLINT CHECK (mood BETWEEN 1 AND 5),
  energy      SMALLINT CHECK (energy BETWEEN 1 AND 5),
  did         TEXT[] NOT NULL DEFAULT '{}',             -- 오늘 한 일 칩들
  blocked     TEXT,                                     -- 막힌 일 한 줄
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, day)
);
COMMENT ON TABLE public.checkins IS '무니스식 일일 체크인. 트윈 기억(user_memories)의 재료';

-- 4) 미룬 일 (Next Step). done_at 이 비어 있고 due_on 이 지났으면 「미룬 일」.
CREATE TABLE IF NOT EXISTS public.next_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mentor_id   UUID REFERENCES public.mentors(id) ON DELETE SET NULL,   -- 어느 봇이 제안했나
  text        TEXT NOT NULL,
  due_on      DATE,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS next_steps_user_open_idx ON public.next_steps (user_id, done_at, due_on);
COMMENT ON TABLE public.next_steps IS '다음 한 걸음. 주간 리포트 「미룬 일」 게이지의 원천';

-- ---------- RLS: 전부 켬, 본인 행만 ----------
ALTER TABLE public.team_bots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.next_steps          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own team_bots" ON public.team_bots;
CREATE POLICY "own team_bots" ON public.team_bots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own permission_requests" ON public.permission_requests;
CREATE POLICY "own permission_requests" ON public.permission_requests
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own checkins" ON public.checkins;
CREATE POLICY "own checkins" ON public.checkins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own next_steps" ON public.next_steps;
CREATE POLICY "own next_steps" ON public.next_steps
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
