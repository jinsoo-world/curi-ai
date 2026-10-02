-- ============================================================
-- 2026-10-02 봇 신고, 봇 차단 (애플 심사 지침 1.2 = 이용자가 만든 내용은 신고, 차단, 운영자 조치가 있어야 한다)
--
--  bot_reports     = 신고 한 건. 로그인 회원(reporter_user_id) 또는 손님(reporter_visitor_id). 둘 중 하나는 꼭 있다.
--                    ip_hash = 소금 친 sha256 인터넷 주소 지문(평문 주소는 남기지 않는다).
--                    excerpt_source = 'server'(서버가 꺼낸 진짜 봇 말) | 'reporter'(신고자가 보낸 인용).
--                    자동 내림 = 7일 안 로그인 회원 3명 + 서로 다른 주소 지문 3개. 손님 신고는 관리자 목록에만. 자동 삭제 없음.
--  user_bot_blocks = 회원이 차단한 봇. 마켓, 팀 목록, 대화, 그룹방, 전달, 루틴에서 그 회원에게만 빠진다.
--                    was_hidden, paused_routine_ids = 차단 전 상태(해제할 때 되돌린다).
--
--  두 표 모두 RLS 켬, 정책 없음 = 서버(서비스 키)만 읽고 쓴다. 봇(mentors)이 지워지면 같이 지워진다.
--  ⚠️ 자동 적용되지 않는다. Supabase SQL 편집기에 통째로 붙여 실행한다(여러 번 실행해도 안전).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id    uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_visitor_id text NULL,
  ip_hash             text NULL,
  mentor_id           uuid NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  message_excerpt     text NULL CHECK (message_excerpt IS NULL OR char_length(message_excerpt) <= 1000),
  excerpt_source      text NULL CHECK (excerpt_source IS NULL OR excerpt_source IN ('server','reporter')),
  reason              text NOT NULL CHECK (reason IN ('spam','sexual','hate','violence','impersonation','personal_info','misinformation','other')),
  detail              text NULL CHECK (detail IS NULL OR char_length(detail) <= 500),
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  handled_at          timestamptz,
  handled_by          uuid,
  CONSTRAINT bot_reports_reporter_present CHECK (reporter_user_id IS NOT NULL OR reporter_visitor_id IS NOT NULL)
);

-- 예전 모양으로 먼저 만들어 둔 경우를 위한 보강 (여러 번 실행해도 안전)
ALTER TABLE public.bot_reports ADD COLUMN IF NOT EXISTS ip_hash text NULL;
ALTER TABLE public.bot_reports ADD COLUMN IF NOT EXISTS excerpt_source text NULL;
UPDATE public.bot_reports SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.bot_reports ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.bot_reports ALTER COLUMN created_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.user_bot_blocks (
  user_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mentor_id          uuid NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  was_hidden         boolean NOT NULL DEFAULT false,
  paused_routine_ids uuid[] NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mentor_id)
);

ALTER TABLE public.user_bot_blocks ADD COLUMN IF NOT EXISTS was_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_bot_blocks ADD COLUMN IF NOT EXISTS paused_routine_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE public.user_bot_blocks SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.user_bot_blocks ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.user_bot_blocks ALTER COLUMN created_at SET NOT NULL;

-- 제약은 이름으로 한 번만 붙인다 (예전 모양 표에 없을 수 있는 것)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bot_reports_reporter_present') THEN
    ALTER TABLE public.bot_reports
      ADD CONSTRAINT bot_reports_reporter_present CHECK (reporter_user_id IS NOT NULL OR reporter_visitor_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bot_reports_excerpt_source_check') THEN
    ALTER TABLE public.bot_reports
      ADD CONSTRAINT bot_reports_excerpt_source_check CHECK (excerpt_source IS NULL OR excerpt_source IN ('server','reporter'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bot_reports'::regclass AND contype = 'f' AND confrelid = 'public.mentors'::regclass
  ) THEN
    ALTER TABLE public.bot_reports
      ADD CONSTRAINT bot_reports_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES public.mentors(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_bot_blocks'::regclass AND contype = 'f' AND confrelid = 'public.mentors'::regclass
  ) THEN
    ALTER TABLE public.user_bot_blocks
      ADD CONSTRAINT user_bot_blocks_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES public.mentors(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bot_reports_mentor_status_created_idx
  ON public.bot_reports (mentor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS bot_reports_status_created_idx
  ON public.bot_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS user_bot_blocks_mentor_idx
  ON public.user_bot_blocks (mentor_id);

ALTER TABLE public.bot_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_bot_blocks ENABLE ROW LEVEL SECURITY;

-- 손님, 회원 연결로는 아무것도 못 한다(정책 없음 + 권한 회수). 서버 서비스 키만 쓴다
REVOKE ALL ON public.bot_reports FROM anon, authenticated;
REVOKE ALL ON public.user_bot_blocks FROM anon, authenticated;
