-- ============================================================
-- 2026-10-20 앱 연결(OAuth) 토큰 임시 보관 — 표 1개 신설. 기존 표는 건드리지 않는다.
--
--   connector_app_pending = 앱에서 시작한 연결이 서비스에서 돌아왔을 때 토큰을 5분만 잠가서 두는 표.
--   앱이 비밀값(appSecret)을 들고 POST /api/connect/app-finish 를 부르면 한 번만 꺼내 본 연결로 옮긴다.
--   (공격자가 자기 시작 주소를 피해자에게 보내 피해자 토큰을 자기 계정에 붙이는 것을 막는다)
--
-- 🔐 secret_encrypted 는 connectors 와 같은 자물쇠(CONNECTOR_SECRET_KEY, AES-256-GCM)로 잠근 토큰 JSON.
--    handoff 원문은 저장하지 않고 sha256 만 둔다.
-- 원칙: RLS 켬 + 정책 0 + anon·authenticated 권한 회수 = 서버(service_role)만.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전). 하루 지난 행은 크론이 지운다.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.connector_app_pending (
  handoff_hash      TEXT PRIMARY KEY,
  user_id           UUID NOT NULL,
  proof_hash        TEXT NOT NULL,
  kind              TEXT NOT NULL,
  secret_encrypted  TEXT NOT NULL,
  meta              JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS connector_app_pending_expires_idx ON public.connector_app_pending (expires_at);

ALTER TABLE public.connector_app_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.connector_app_pending FROM anon, authenticated;
GRANT ALL ON public.connector_app_pending TO service_role;
