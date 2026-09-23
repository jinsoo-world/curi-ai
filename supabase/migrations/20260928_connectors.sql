-- ============================================================
-- 2026-09-28 외부 연결(커넥터) — 표 1개 신설. 기존 표는 건드리지 않는다.
--
--   connectors = 사용자가 붙여 둔 밖의 도구 열쇠(노션 토큰·슬랙 웹훅 주소).
--
-- 🔐 열쇠는 **그대로 저장하지 않는다.** 서버 환경변수 CONNECTOR_SECRET_KEY(32바이트)로
--    AES-256-GCM 으로 잠가서 secret_encrypted 에 넣는다(src/domains/connectors/crypto.ts).
--    환경변수가 없으면 연결 기능 자체가 「준비 중」으로 꺼진다.
--    열쇠 만들기: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
--
-- 원칙: RLS 켬 + 본인 행만. 서버는 service_role 로 RLS 를 우회하니 API 에서 user_id 를 꼭 검사한다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.connectors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('notion', 'slack', 'kakao', 'instagram', 'curious')),
  label             TEXT NOT NULL DEFAULT '내 연결',          -- 화면에 보이는 이름
  secret_encrypted  TEXT NOT NULL,                            -- 🔐 잠긴 열쇠 "v1.iv.tag.암호문". 평문 금지
  meta              JSONB NOT NULL DEFAULT '{}'::jsonb,       -- { hint: '••••1234', workspace: '...' } — 열쇠 원문은 넣지 않는다
  status            TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS connectors_user_idx ON public.connectors (user_id, kind);

COMMENT ON TABLE  public.connectors               IS '밖의 도구 연결(노션·슬랙). 열쇠는 AES-256-GCM 으로 잠가서 넣는다';
COMMENT ON COLUMN public.connectors.secret_encrypted IS '잠긴 열쇠. 평문을 넣지 마라. 자물쇠는 CONNECTOR_SECRET_KEY';
COMMENT ON COLUMN public.connectors.meta          IS '가림 글(끝 4자)·작업공간 이름 등. 개인정보·열쇠 원문 금지';

-- ---------- RLS: 본인 행만 ----------
ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connectors_select_own" ON public.connectors;
CREATE POLICY "connectors_select_own" ON public.connectors
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "connectors_insert_own" ON public.connectors;
CREATE POLICY "connectors_insert_own" ON public.connectors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "connectors_update_own" ON public.connectors;
CREATE POLICY "connectors_update_own" ON public.connectors
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "connectors_delete_own" ON public.connectors;
CREATE POLICY "connectors_delete_own" ON public.connectors
  FOR DELETE USING (auth.uid() = user_id);
