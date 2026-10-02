-- ============================================================
-- 2026-10-02 봇 신고, 봇 차단 (애플 심사 지침 1.2 = 이용자가 만든 내용은 신고, 차단, 운영자 조치가 있어야 한다)
--
--  bot_reports     = 신고 한 건. 로그인 회원(reporter_user_id) 또는 손님(reporter_visitor_id).
--                    7일 안에 서로 다른 신고자 3명이 열린 신고를 넣으면 서버가 봇을 자동으로 내리고(is_active=false)
--                    관리자 확인 대기에 올린다. 자동 삭제는 하지 않는다.
--  user_bot_blocks = 회원이 차단한 봇. 마켓, 팀 목록, 대화, 그룹방에서 그 회원에게만 빠진다.
--
--  두 표 모두 RLS 켬, 정책 없음 = 서버(서비스 키)만 읽고 쓴다.
--  ⚠️ 자동 적용되지 않는다. Supabase SQL 편집기에 통째로 붙여 실행한다(여러 번 실행해도 안전).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id    uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_visitor_id text NULL,
  mentor_id           uuid NOT NULL,
  message_excerpt     text NULL CHECK (message_excerpt IS NULL OR char_length(message_excerpt) <= 1000),
  reason              text NOT NULL CHECK (reason IN ('spam','sexual','hate','violence','impersonation','personal_info','misinformation','other')),
  detail              text NULL CHECK (detail IS NULL OR char_length(detail) <= 500),
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')),
  created_at          timestamptz DEFAULT now(),
  handled_at          timestamptz,
  handled_by          uuid
);

CREATE INDEX IF NOT EXISTS bot_reports_mentor_status_created_idx
  ON public.bot_reports (mentor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS bot_reports_status_created_idx
  ON public.bot_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_bot_blocks (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mentor_id  uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, mentor_id)
);

ALTER TABLE public.bot_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_bot_blocks ENABLE ROW LEVEL SECURITY;

-- 손님, 회원 연결로는 아무것도 못 한다(정책 없음 + 권한 회수). 서버 서비스 키만 쓴다
REVOKE ALL ON public.bot_reports FROM anon, authenticated;
REVOKE ALL ON public.user_bot_blocks FROM anon, authenticated;
