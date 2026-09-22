-- ============================================================
-- 2026-09-27 메시징(푸시·문자·이메일) + 요청 횟수 제한 — 표 4개 신설. 기존 표는 건드리지 않는다.
--
--   push_subscriptions  = 웹푸시 구독(기기마다 한 줄). 아이폰은 홈 화면 PWA 에서(iOS 16.4+)
--   message_log         = 밖으로 나간(또는 막힌) 메시지 기록. 받는 곳은 끝 4자만(to_hint)
--   notification_prefs  = 사용자 알림 설정(채널 3개 켬/끔 + 조용한 시간). 문자는 기본 꺼짐(돈 드는 채널)
--   rate_limits         = 요청 횟수 제한 카운터(보안 C-1 9번). 서버 전용
-- 원칙: RLS 켬 + 본인 행만. rate_limits 는 정책 없음(= 브라우저에서 아무도 못 읽음, 서버 service_role 만).
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

-- 1) 웹푸시 구독
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,                    -- 브라우저가 준 푸시 주소. 기기·브라우저마다 다르다
  keys        JSONB NOT NULL,                          -- { p256dh, auth } 암호 열쇠(브라우저가 만든 것)
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);
COMMENT ON TABLE public.push_subscriptions IS '웹푸시 구독. 404/410 이 오면 서버가 지운다';

-- 2) 메시지 기록 (나간 것·실패한 것·막힌 것 전부)
CREATE TABLE IF NOT EXISTS public.message_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL CHECK (channel IN ('push', 'sms', 'email')),
  to_hint               TEXT,                                          -- 받는 곳 끝 4자만. 전체 번호·주소 금지
  subject               TEXT,
  status                TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'blocked')),
  permission_request_id UUID REFERENCES public.permission_requests(id) ON DELETE SET NULL,  -- 남에게 보낸 것은 승인 카드가 붙는다
  error                 TEXT,                                          -- 실패 이유 / 막힌 이유(no_permission·quiet_hours…)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS message_log_user_idx ON public.message_log (user_id, created_at DESC);
COMMENT ON TABLE public.message_log IS '발신 감사로그. 본문은 남기지 않는다';

-- 3) 알림 설정 (사용자당 한 줄)
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id     UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  push        BOOLEAN NOT NULL DEFAULT true,
  sms         BOOLEAN NOT NULL DEFAULT false,        -- 돈 드는 채널. 사용자가 켜야 한다
  email       BOOLEAN NOT NULL DEFAULT true,
  quiet_from  TIME,                                  -- 비우면 서버 기본 22:00
  quiet_to    TIME,                                  -- 비우면 서버 기본 08:00 (Asia/Seoul)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.notification_prefs IS '알림 채널 켬/끔 + 조용한 시간. 조용한 시간엔 푸시·문자 보류, 이메일은 간다';

-- 4) 요청 횟수 제한 카운터 (서버 전용)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key           TEXT NOT NULL,                       -- 예) chat:u:<user_id> / image:u:<user_id>
  window_start  TIMESTAMPTZ NOT NULL,                -- 창 시작(분·시간 단위로 내림)
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
COMMENT ON TABLE public.rate_limits IS '요청 횟수 제한. 하루 지난 줄은 지워도 된다';

-- ---------- RLS ----------
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits        ENABLE ROW LEVEL SECURITY;   -- 정책 없음 = 서버(service_role)만

DROP POLICY IF EXISTS "own push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "own push_subscriptions" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own message_log read" ON public.message_log;
CREATE POLICY "own message_log read" ON public.message_log
  FOR SELECT USING (auth.uid() = user_id);           -- 기록은 서버만 쓴다. 사용자는 읽기만

DROP POLICY IF EXISTS "own notification_prefs" ON public.notification_prefs;
CREATE POLICY "own notification_prefs" ON public.notification_prefs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
