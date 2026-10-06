-- 대화 경로 「통째로 멈춤」 점검 후속 (2026-10-06). 여러 번 실행해도 안전하다. 새 표·새 칸 없음.
-- 코드는 이 함수들이 없어도 옛 방식으로 돈다(배포가 먼저 나가도 안 깨진다). 단 AI_BUDGET_MONTHLY_KRW 를 켜기 전에는 이 파일과 20261008_llm_cost_month.sql(PR #54)을 꼭 적용한다.
-- 전부 서버 열쇠(service_role)만 부를 수 있다.

-- 1) 사용량 세기를 함수 하나로.
--    예전엔 서버가 대화방 id 를 전부 읽어 주소(.in)에 넣어 셌다 — 대화방이 많으면 주소가 길어 실패하고 느렸다.
--    p_mentor 를 주면 그 봇과의 1:1 대화만 센다(방문자 주간 한도용, 그룹방은 안 센다).
CREATE OR REPLACE FUNCTION public.count_user_turns(p_user uuid, p_since timestamptz, p_mentor uuid DEFAULT NULL)
RETURNS TABLE (turns bigint, oldest timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH s AS (
    SELECT count(*) AS n, min(m.created_at) AS oldest
    FROM public.messages m
    JOIN public.chat_sessions cs ON cs.id = m.session_id
    WHERE cs.user_id = p_user
      AND (p_mentor IS NULL OR cs.mentor_id = p_mentor)
      AND m.role = 'user'
      AND m.created_at >= p_since
  ), c AS (
    SELECT count(*) AS n
    FROM public.channel_messages cm
    JOIN public.channels ch ON ch.id = cm.channel_id
    WHERE p_mentor IS NULL
      AND ch.user_id = p_user
      AND cm.author_kind = 'user'
      AND cm.created_at >= p_since
  )
  SELECT s.n + c.n, s.oldest FROM s, c;
$$;
REVOKE ALL ON FUNCTION public.count_user_turns(uuid, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_user_turns(uuid, timestamptz, uuid) TO service_role;

-- 2) 이번 달 AI 원가 합계는 PR #54 의 llm_cost_krw_month(20261008_llm_cost_month.sql)를 그대로 쓴다. 여기서 새로 만들지 않는다.

-- 3) 소리 읽기 실패 시 하루 글자 수 되돌리기 (tts_charge_chars 로 올린 만큼만, 0 아래로는 안 내려간다)
CREATE OR REPLACE FUNCTION public.tts_refund_chars(p_key text, p_window timestamptz, p_chars integer)
RETURNS integer
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.rate_limits
     SET count = greatest(0, count - greatest(0, coalesce(p_chars, 0)))
   WHERE key = p_key AND window_start = p_window
  RETURNING count;
$$;
REVOKE ALL ON FUNCTION public.tts_refund_chars(text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tts_refund_chars(text, timestamptz, integer) TO service_role;

-- 4) 손님 횟수 세기용 색인 (IP·방문자 번호 + 오늘)
CREATE INDEX IF NOT EXISTS idx_guest_logs_ip_created ON public.guest_chat_logs (ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_guest_logs_visitor_created ON public.guest_chat_logs (visitor_id, created_at);
