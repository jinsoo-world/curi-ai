-- ============================================================
-- 2026-10-20 앱 연결(OAuth) 1회용 번호 — 표 1개 신설. 기존 표는 건드리지 않는다.
--
--   connector_app_nonces = 앱에서 시작한 연결의 state 안에 든 1회용 번호를 「썼다」고 적어 두는 표.
--   같은 state 를 두 번 들고 오면 두 번째는 여기서 막힌다(unique 위반).
--
-- 원칙: RLS 켬 + 정책 없음 = 서버(service_role)만 읽고 쓴다. 사용자 화면은 이 표를 못 본다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- 청소: 하루 지난 행은 크론(/api/cron/retention-purge)이 지운다(state 유효 10분).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.connector_app_nonces (
  nonce       TEXT PRIMARY KEY,
  user_id     UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS connector_app_nonces_created_idx ON public.connector_app_nonces (created_at);

ALTER TABLE public.connector_app_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.connector_app_nonces FROM anon, authenticated;
GRANT ALL ON public.connector_app_nonces TO service_role;
