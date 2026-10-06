-- 명단 화면의 「마지막 말 한 줄」 (2026-10-18)
-- 봇별 대화(messages)·그룹방(channel_messages)마다 가장 최근 말 1건을 한 번에 돌려주는 함수 2개.
-- 새 표·새 칸 없음. 읽기 전용. 여러 번 실행해도 안전.
--
-- SECURITY INVOKER = 부르는 쪽 권한(RLS)을 그대로 따른다. 남의 방 id 를 넘겨도 RLS 가 막는다.
-- (그룹방 목록 API 는 서버 열쇠로 부르지만, 본인 방 id 만 넘긴다.)
-- 함수가 없어도 API 는 죽지 않고 last_message_preview = null 로 나간다.

CREATE OR REPLACE FUNCTION public.last_messages_for_sessions(p_ids uuid[])
RETURNS TABLE (owner_id uuid, content text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT DISTINCT ON (m.session_id) m.session_id, m.content, m.created_at
  FROM public.messages m
  WHERE m.session_id = ANY(p_ids)
  ORDER BY m.session_id, m.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.last_messages_for_channels(p_ids uuid[])
RETURNS TABLE (owner_id uuid, content text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT DISTINCT ON (m.channel_id) m.channel_id, m.content, m.created_at
  FROM public.channel_messages m
  WHERE m.channel_id = ANY(p_ids)
  ORDER BY m.channel_id, m.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.last_messages_for_sessions(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.last_messages_for_channels(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.last_messages_for_sessions(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.last_messages_for_channels(uuid[]) TO authenticated, service_role;
