-- messages.origin — 이 메시지가 어디서 만들어졌는가. (여러 번 실행해도 안전하다)
--   server       = 서버가 봇 답으로 직접 만든 것(기본값). 소리로 읽기(/api/tts)는 이것만 읽는다.
--   guest_import = 손님이 브라우저에서 가져온 대화를 로그인 때 옮겨 저장한 것(봇이 한 말이라고 믿을 수 없다).
--   handoff      = @봇 넘김·릴레이로 서버가 넣은 안내/전달 글.
--   routine      = 루틴(예약 작업) 결과로 서버가 저장한 글. 소리로 읽지 않는다.
-- 코드 배포 전에 먼저 적용한다(코드가 이 칸을 읽는다). 기존 행은 전부 'server' 로 채워진다.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'server';
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_origin_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_origin_check
  CHECK (origin IN ('server', 'guest_import', 'handoff', 'routine'));

-- 방어 한 겹 더: 서버 열쇠(service_role)나 DB 관리자가 아니면
--   · INSERT 는 origin 을 무조건 'guest_import' 로 바꾼다(회원 권한으로 쓴 글은 봇 답이 될 수 없다)
--   · UPDATE 로 content·origin 을 바꾸면 예외
-- SECURITY DEFINER 를 쓰지 않는다(호출한 사람의 권한으로 돌아야 current_user 가 맞다).
CREATE OR REPLACE FUNCTION public.messages_origin_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.origin := 'guest_import';
  ELSIF NEW.content IS DISTINCT FROM OLD.content OR NEW.origin IS DISTINCT FROM OLD.origin THEN
    RAISE EXCEPTION 'messages 의 content, origin 은 서버만 바꿀 수 있습니다';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS messages_origin_guard ON public.messages;
CREATE TRIGGER messages_origin_guard
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_origin_guard();

-- 소리 읽기 하루 글자 수 상한을 원자적으로 올린다.
-- 상한을 넘지 않을 때만 더하고 true, 넘으면 아무것도 바꾸지 않고 false. (한 줄 UPSERT 라 동시 요청에도 안전)
CREATE OR REPLACE FUNCTION public.tts_charge_chars(p_key text, p_window timestamptz, p_chars integer, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_chars IS NULL OR p_chars < 0 OR p_chars > p_limit THEN
    RETURN false;
  END IF;
  INSERT INTO public.rate_limits AS r (key, window_start, count)
  VALUES (p_key, p_window, p_chars)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = r.count + EXCLUDED.count
  WHERE r.count + EXCLUDED.count <= p_limit
  RETURNING r.count INTO v_count;
  RETURN v_count IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.tts_charge_chars(text, timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tts_charge_chars(text, timestamptz, integer, integer) TO service_role;
