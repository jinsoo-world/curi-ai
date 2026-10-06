-- 요청 횟수 제한을 한 번에 세는 함수 (2026-10-21, PR #50 보안 검토)
-- 예전엔 서버가 count 를 읽고(select) 하나 더해 쓰는(upsert) 두 걸음이라, 같은 순간 요청 여러 개가 같은 값을 읽고 한도를 넘을 수 있었다.
-- 이 함수는 넣기와 더하기를 한 문장으로 해서 올린 뒤의 값을 돌려준다. 서버(lib/rate-limit.ts)가 그 값을 한도와 비교한다.
-- 새 표·새 칸 없음(rate_limits 그대로). 서버 열쇠(service_role)만 부를 수 있다. 여러 번 실행해도 안전.
-- 함수가 없어도 서버는 옛 방식으로 센다 (배포가 이 파일보다 먼저 나가도 안 깨진다).

CREATE OR REPLACE FUNCTION public.bump_rate_limit(p_key text, p_ws timestamptz)
RETURNS integer
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public AS $$
  INSERT INTO public.rate_limits AS r (key, window_start, count)
  VALUES (p_key, p_ws, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = r.count + 1
  RETURNING r.count;
$$;

REVOKE ALL ON FUNCTION public.bump_rate_limit(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(text, timestamptz) TO service_role;
