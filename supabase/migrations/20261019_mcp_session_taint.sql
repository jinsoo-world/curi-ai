-- ============================================================
-- 2026-10-06 MCP 세션 오염 표시 — 표 1개 신설. 기존 표는 건드리지 않는다.
--
--   mcp_session_taint = 이 대화방(chat_sessions)에서 MCP 도구 결과(바깥 자료)를 한 번이라도 썼다는 서버 기록.
--   이 줄이 있는 대화방의 다음 대화는 처음부터 쓰기 도구를 숨긴다(「읽고 → 밖으로 보내기」 연쇄를 대화를 넘어서도 끊는다).
--
-- 왜 chat_sessions 에 칸을 더하지 않았나 = chat_sessions 는 회원이 자기 행을 직접 고칠 수 있는 표다
--   (정책 "Users can manage own sessions"). 거기 두면 회원이 표시를 지워 쓰기 도구를 다시 열 수 있다.
--   그래서 서버 전용 표로 따로 둔다: RLS 켬 + 정책 0개 + anon·authenticated 권한 회수 (mcp_servers 와 같은 방식).
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mcp_session_taint (
  session_id  UUID PRIMARY KEY REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tainted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.mcp_session_taint IS '이 대화방에서 MCP 도구 결과를 썼다는 서버 기록. 있으면 다음 대화부터 쓰기 도구를 숨긴다. 서버 전용';

ALTER TABLE public.mcp_session_taint ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_session_taint FROM anon, authenticated;
GRANT ALL ON public.mcp_session_taint TO service_role;
