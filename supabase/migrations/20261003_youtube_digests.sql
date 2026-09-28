-- ============================================================
-- 2026-10-03 유튜브 영상 정리 저장 표 2개 신설 (추가만, 기존 표는 건드리지 않는다)
--
-- 대표 결정 0928 「가성비 있게 가자」: 자막이 막힌 유튜브 영상(Vercel 서버 IP)은 Gemini 에게 한 번 보여 주고
-- 한국어 구간 정리를 받는다. 코드 = src/domains/os/readers/youtube-gemini.ts
--
--   youtube_digests       = 영상 번호 하나당 정리 하나. 모든 사람이 같이 쓴다(영상마다 한 번만 돈이 든다).
--   youtube_digest_calls  = Gemini 를 부를 때마다 한 줄 (하루 한도 세기 + 실제 토큰 수, 계산한 값).
--
-- 서버 코드(service_role)만 읽고 쓴다. RLS 를 켜고 정책을 두지 않아 화면(anon, authenticated)에서는 안 보인다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행. 여러 번 실행해도 안전.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.youtube_digests (
  video_id         TEXT PRIMARY KEY CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title            TEXT,
  channel          TEXT,
  text             TEXT NOT NULL,
  model            TEXT NOT NULL,
  prompt_tokens    INT,
  output_tokens    INT,
  thoughts_tokens  INT,
  total_tokens     INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.youtube_digest_calls (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id         TEXT NOT NULL,
  user_id          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  model            TEXT,
  status           TEXT NOT NULL DEFAULT 'started'
                   CHECK (status IN ('started', 'ok', 'error', 'empty')),
  error            TEXT,
  prompt_tokens    INT,
  output_tokens    INT,
  thoughts_tokens  INT,
  total_tokens     INT,
  video_tokens     INT,
  audio_tokens     INT,
  cost_usd         NUMERIC(12, 6),        -- 유료 가격표로 계산한 값 (미리보기 기간 실제 청구와 다를 수 있다)
  ms               INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 하루 한도 세기 (전체, 사람별)
CREATE INDEX IF NOT EXISTS youtube_digest_calls_created_idx ON public.youtube_digest_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS youtube_digest_calls_user_idx    ON public.youtube_digest_calls (user_id, created_at DESC);

ALTER TABLE public.youtube_digests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_digest_calls ENABLE ROW LEVEL SECURITY;
