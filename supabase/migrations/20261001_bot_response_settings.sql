-- ============================================================
-- 2026-10-01 봇 「답변 설정」(델파이 Response Settings 급) — 표 1개 신설.
--
-- 봇 하나(mentor_id)마다 한 줄. 목적·추가 지침(최대 3개)·말투·첫 인사·
-- 자료 없을 때 할 말·길이·창의성(Strict/Adaptive/Creative)·출처 카드·안내문·최신성.
--
-- 기본값(표에 줄이 없을 때)은 서버 코드(domains/os/response-settings.ts)가 정한다:
--   내 팀 봇(chief/helper)     = Adaptive
--   트윈·리더 봇(마켓 공개 봇) = Strict + 출처 on
-- 표가 아직 없어도(마이그레이션 전) 채팅은 기본값으로 그대로 동작한다.
--
-- 원칙: RLS 켬 + 본인 행만. 서버(service_role)는 RLS 를 우회하므로 API 에서 user_id 를 반드시 검사한다
--       (team_bots 로 「이 봇이 내 팀 봇인가」를 먼저 확인 — domains/os/knowledge.ts 의 assertBotOwned 재사용).
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_response_settings (
  mentor_id           UUID PRIMARY KEY REFERENCES public.mentors(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  purpose             TEXT CHECK (purpose IS NULL OR length(purpose) <= 200),
  -- 최대 3개, 각 300자까지. 개수는 표에서도 한 번 더 막는다(앱에서도 자른다).
  custom_instructions TEXT[] NOT NULL DEFAULT '{}'::text[]
                        CHECK (array_length(custom_instructions, 1) IS NULL OR array_length(custom_instructions, 1) <= 3),
  style               TEXT CHECK (style IS NULL OR length(style) <= 500),
  initial_message     TEXT CHECK (initial_message IS NULL OR length(initial_message) <= 300),
  no_answer_text      TEXT CHECK (no_answer_text IS NULL OR length(no_answer_text) <= 300),

  length              TEXT NOT NULL DEFAULT 'intelligent'
                        CHECK (length IN ('intelligent', 'concise', 'explanatory', 'custom')),
  custom_length       INTEGER CHECK (custom_length IS NULL OR custom_length BETWEEN 50 AND 4000),

  creativity          TEXT NOT NULL DEFAULT 'adaptive'
                        CHECK (creativity IN ('strict', 'adaptive', 'creative')),

  citations_on        BOOLEAN NOT NULL DEFAULT true,
  disclaimer          TEXT CHECK (disclaimer IS NULL OR length(disclaimer) <= 300),
  recency_on          BOOLEAN NOT NULL DEFAULT true,

  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_response_settings_user_idx ON public.bot_response_settings (user_id);

COMMENT ON TABLE public.bot_response_settings IS '봇별 답변 설정(델파이 Response Settings 급). 줄이 없으면 코드 기본값(내 팀 봇=Adaptive, 트윈·리더 봇=Strict) 그대로 동작';
COMMENT ON COLUMN public.bot_response_settings.creativity IS 'strict=자료에 없으면 모델을 안 부르고 no_answer_text 바로 반환 · adaptive=자료 우선+일반지식 보완 · creative=자유';
COMMENT ON COLUMN public.bot_response_settings.length IS 'intelligent=상황에 맞게 · concise=짧게 · explanatory=자세히 · custom=custom_length 글자수 안팎';

ALTER TABLE public.bot_response_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_response_settings_select_own" ON public.bot_response_settings;
CREATE POLICY "bot_response_settings_select_own" ON public.bot_response_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bot_response_settings_insert_own" ON public.bot_response_settings;
CREATE POLICY "bot_response_settings_insert_own" ON public.bot_response_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bot_response_settings_update_own" ON public.bot_response_settings;
CREATE POLICY "bot_response_settings_update_own" ON public.bot_response_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bot_response_settings_delete_own" ON public.bot_response_settings;
CREATE POLICY "bot_response_settings_delete_own" ON public.bot_response_settings
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_response_settings TO authenticated;
GRANT ALL ON public.bot_response_settings TO service_role;
