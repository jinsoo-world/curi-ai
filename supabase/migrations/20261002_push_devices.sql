-- ============================================================
-- 2026-10-02 앱 알림(아이폰·안드로이드 네이티브 푸시) — 표 2개 신설. 기존 표는 건드리지 않는다.
--
--   push_devices = 앱 기기 번호(애플 APNs 번호 / 구글 FCM 번호). 기기 번호 하나에 한 줄(token unique)
--                  한 기기에서 계정을 바꿔 로그인하면 그 줄이 새 계정으로 옮겨간다
--   push_sends   = 보낸(또는 막힌) 알림 기록. 기기마다 한 줄, 같은 발송은 batch_id 로 묶인다
--                  opened_at = 앱에서 눌렀을 때(POST /api/push/opened). 나중에 「누른 비율」을 센다
-- 원칙: RLS 켬 + 정책 없음 + anon·authenticated 권한 회수 = 브라우저·앱에서 직접 못 읽는다. 서버(service_role)만.
-- 탈퇴: users 지우면 둘 다 연쇄 삭제(ON DELETE CASCADE). 탈퇴 코드(domains/account/delete.ts)도 먼저 지운다.
-- 웹푸시 구독(push_subscriptions, 20260927)과는 따로 간다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

-- 1) 앱 기기 번호
CREATE TABLE IF NOT EXISTS public.push_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  token           TEXT NOT NULL UNIQUE,                 -- 애플 = 소문자 16진수, 구글 = FCM 등록 번호
  apns_env        TEXT CHECK (apns_env IN ('sandbox', 'production')),  -- 아이폰만. 엑스코드 개발 빌드 = sandbox, 테스트플라이트·앱스토어 = production
  app_version     TEXT,
  locale          TEXT,
  timezone        TEXT,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- 앱이 마지막으로 번호를 보낸 시각(실행·로그인 때마다)
  disabled_at     TIMESTAMPTZ,                          -- 애플·구글이 「죽은 번호」라 하면 서버가 채운다. 다시 등록하면 비운다
  disabled_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT push_devices_apns_env_ios CHECK (platform = 'ios' OR apns_env IS NULL)
);
CREATE INDEX IF NOT EXISTS push_devices_user_idx ON public.push_devices (user_id) WHERE disabled_at IS NULL;
COMMENT ON TABLE public.push_devices IS '앱 알림 기기 번호. 서버 전용(RLS 켬, 정책 없음)';

-- 2) 보낸 알림 기록
CREATE TABLE IF NOT EXISTS public.push_sends (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),   -- 앱이 받는 sendId
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id   UUID REFERENCES public.push_devices(id) ON DELETE SET NULL,   -- 막힌 시도는 비어 있다
  batch_id    UUID NOT NULL,                                -- 한 번의 발송(기기 여러 대) 묶음. 하루 상한은 이걸로 센다
  push_type   TEXT NOT NULL,                                -- 설계서 번호 P001·P014… / TEST
  category    TEXT NOT NULL CHECK (category IN ('info', 'ad')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  deeplink    TEXT,                                         -- curiai://bot/{id} · curiai://group/{id} · curiai://home
  dedupe_key  TEXT,                                         -- 같은 소식 겹침 막기 열쇠(봇 번호, 방 번호 등)
  status      TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'blocked')),
  error       TEXT,                                         -- 실패 이유 / 막힌 이유(daily_cap·ad_no_consent·quiet_hours…)
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_sends_user_sent_idx ON public.push_sends (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS push_sends_dedupe_idx ON public.push_sends (user_id, push_type, dedupe_key, sent_at DESC) WHERE dedupe_key IS NOT NULL;
COMMENT ON TABLE public.push_sends IS '앱 알림 발송 기록(기기마다 한 줄). 서버 전용(RLS 켬, 정책 없음)';

-- ---------- 잠금: 서버(service_role)만 ----------
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_sends   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_devices FROM anon, authenticated;
REVOKE ALL ON public.push_sends   FROM anon, authenticated;
