-- ============================================================
-- 2026-10-11 봇이 남에게 보내는 메일 잠금(1002 설계 8번): 받는 주소 지문 칸.
--
--  /api/os/messages/send 는 1인 하루 「새로운 받는 분 5명」을 센다. 지금 message_log 에는
--  주소 끝 4자(to_hint)만 있어 서로 다른 사람인지 가를 수 없다. 그래서 주소 대신
--  지문(소문자로 바꾼 주소의 sha256)만 적는 칸을 더한다. 주소 자체는 여전히 남기지 않는다.
--
--  이 마이그레이션이 없어도 서버는 멈추지 않는다: 지문 없이 적고, 보낸 한 통을 새 사람 한 명으로
--  친다(= 하루 5통까지로 더 좁게 막힌다). 적용하면 같은 분께 다시 보내는 메일은 5명에 안 들어간다.
--
--  RLS: message_log 는 20260927_messaging.sql 에서 이미 켜져 있고(본인 행만 읽기) 칸 추가로 바뀌지 않는다.
--  ⚠️ 자동 적용되지 않는다. Supabase SQL 편집기에 통째로 붙여 직접 실행한다(여러 번 실행해도 안전).
-- ============================================================

ALTER TABLE public.message_log ADD COLUMN IF NOT EXISTS to_hash TEXT;
COMMENT ON COLUMN public.message_log.to_hash IS '받는 주소 지문(sha256, 소문자). 주소 원문은 남기지 않는다. 남에게 보낸 메일 하루 상한 계산용';

CREATE INDEX IF NOT EXISTS message_log_user_email_day_idx
  ON public.message_log (user_id, created_at DESC)
  WHERE channel = 'email' AND permission_request_id IS NOT NULL;

ALTER TABLE public.message_log ENABLE ROW LEVEL SECURITY;
