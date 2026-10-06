-- ============================================================
-- 2026-10-06 MCP 서버 연결 — 표 1개 신설. 기존 표는 건드리지 않는다.
--
--   mcp_servers = 회원이 붙인 MCP 서버(https 주소). 회원의 봇이 대화 중에 그 서버의 도구를 부른다.
--
-- 🔐 인증 값(Bearer 토큰 등)은 그대로 저장하지 않는다. connectors 와 같은 자물쇠
--    CONNECTOR_SECRET_KEY 로 AES-256-GCM 잠가 auth_encrypted 에 넣는다(src/domains/connectors/crypto.ts).
-- 한도(요금제별 개수: 무료 1·베이직 3·프로 10)는 서버 코드(src/domains/mcp/limits.ts)가 지킨다.
--
-- 원칙: **서버 전용 표.** RLS 켜고 정책 0개 + anon·authenticated 권한 회수 = 회원이 Supabase 로 직접 읽기·쓰기 불가.
--       서버(service_role)만 읽고 쓰며, API 가 모든 질의에 user_id 를 건다 (20261002_push_devices.sql 과 같은 방식).
--       이유(보안 검토 1006) = 회원이 직접 쓰면 서버의 주소 검사(SSRF)·요금제 한도·봇 주인 확인을 건너뛸 수 있다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mcp_servers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  url               TEXT NOT NULL CHECK (url LIKE 'https://%' AND char_length(url) <= 2000),
  auth_header_name  TEXT NOT NULL DEFAULT 'Authorization' CHECK (auth_header_name ~ '^[A-Za-z0-9-]{1,64}$'),
  auth_encrypted    TEXT,                                     -- 🔐 잠긴 인증 값 "v1.iv.tag.암호문". 평문 금지. 없으면 NULL
  auth_hint         TEXT,                                     -- 화면용 가림 글 '••••abcd'
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  bot_ids           UUID[],                                   -- NULL = 내 봇 전체, 아니면 이 봇들만 (서버가 내 봇인지 확인)
  allowed_tools     TEXT[] NOT NULL DEFAULT '{}',             -- 회원이 쓰기를 허용한 도구 이름. 기본은 읽기 전용 도구만 봇이 쓴다
  status            TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'ok', 'error')),
  last_error        TEXT,                                     -- 우리가 만든 한 줄 이유. 인증 값 금지
  tool_count        INTEGER,
  last_checked_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 앞판(정책 4개 판)을 이미 실행했어도 이 파일을 다시 실행하면 맞춰진다
ALTER TABLE public.mcp_servers ADD COLUMN IF NOT EXISTS allowed_tools TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS mcp_servers_user_idx ON public.mcp_servers (user_id, enabled);

COMMENT ON TABLE  public.mcp_servers                IS '회원이 붙인 MCP 서버. 봇이 대화 중 도구로 쓴다. 인증 값은 AES-256-GCM 으로 잠가서 넣는다';
COMMENT ON COLUMN public.mcp_servers.auth_encrypted IS '잠긴 인증 값. 평문을 넣지 마라. 자물쇠는 CONNECTOR_SECRET_KEY';
COMMENT ON COLUMN public.mcp_servers.bot_ids        IS 'NULL = 내 봇 전체. 배열이면 그 봇 대화에서만 쓴다';
COMMENT ON COLUMN public.mcp_servers.allowed_tools  IS '쓰기를 허용한 도구 이름. 읽기 전용(readOnlyHint) 도구는 여기 없어도 쓴다';

-- ---------- RLS: 서버 전용 (정책 없음 = 회원 직접 접근 0) ----------
ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mcp_servers_select_own" ON public.mcp_servers;
DROP POLICY IF EXISTS "mcp_servers_insert_own" ON public.mcp_servers;
DROP POLICY IF EXISTS "mcp_servers_update_own" ON public.mcp_servers;
DROP POLICY IF EXISTS "mcp_servers_delete_own" ON public.mcp_servers;

REVOKE ALL ON public.mcp_servers FROM anon, authenticated;
GRANT ALL ON public.mcp_servers TO service_role;
