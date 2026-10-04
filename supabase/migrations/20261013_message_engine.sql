-- ============================================================
-- 2026-10-13 메시지엔진 1차 (설계서 02_제품/큐리스/큐리AI_메시지엔진_설계_1002.md 1차 1~6번)
--
--   1) users 에 채널별 광고 동의 네 칸 + 동의 바꾼 시각. 옛 marketing_consent 를 옮겨 담고 인원을 센다
--      그 뒤 marketing_consent 가 바뀌면(가입·내 정보 화면) 트리거가 네 칸을 같이 바꾼다
--   2) message_types           유형 장부 켬/끔 (기본값은 코드 registry.ts, 이 표는 대표가 바꾼 값만)
--   3) message_suppressions    받지 않을 사람 명단(주소 원문 없이 지문만)
--   4) message_log 에 칸 더하기 (유형·정보/광고·채널·캠페인 열쇠·겹침 열쇠·앱 푸시 묶음 번호·시험 여부)
--   5) message_campaigns / message_campaign_sends  캠페인 = 예약 한 줄, (캠페인, 사람)은 겹칠 수 없다
--   6) message_log_unified     보냄·막힘 기록 보기(message_log + 앱 푸시 기기별 줄)
--
-- 원칙: 더하기만 한다(지우기·자르기 없음). 여러 번 실행해도 같다. 새 표는 RLS 켬 + 정책 없음 + 브라우저 권한 회수 = 서버만.
--       users 의 RLS·정책은 바꾸지 않는다.
-- ⚠️ 자동 적용되지 않는다. Supabase SQL 편집기에 통째로 붙여 실행한다.
-- ============================================================

-- 1) 채널별 광고 동의 ------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ad_consent_app_push BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ad_consent_web_push BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ad_consent_email    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ad_consent_sms      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ad_consent_updated_at TIMESTAMPTZ;
COMMENT ON COLUMN public.users.ad_consent_app_push IS '앱 푸시 광고 수신 동의. 옛 marketing_consent 에서 옮겨 담음(2026-10-13)';
COMMENT ON COLUMN public.users.ad_consent_updated_at IS '광고 동의를 마지막으로 바꾼 시각. 그보다 먼저 생긴 수신 거부·탈퇴 명단 줄은 광고를 막지 않는다(다시 동의)';

-- 옮겨 담기 + 인원 세기. 옛 칸이 참인 사람 중 새 칸이 하나라도 거짓인 사람만 고친다(여러 번 실행해도 같다)
DO $$
DECLARE before_n BIGINT; fixed_n BIGINT; a BIGINT; w BIGINT; e BIGINT; s BIGINT; mism BIGINT;
BEGIN
  SELECT count(*) INTO before_n FROM public.users WHERE marketing_consent IS TRUE;
  UPDATE public.users
     SET ad_consent_app_push = true, ad_consent_web_push = true, ad_consent_email = true, ad_consent_sms = true,
         ad_consent_updated_at = COALESCE(ad_consent_updated_at, updated_at, now())
   WHERE marketing_consent IS TRUE
     AND NOT (ad_consent_app_push AND ad_consent_web_push AND ad_consent_email AND ad_consent_sms);
  GET DIAGNOSTICS fixed_n = ROW_COUNT;
  SELECT count(*) FILTER (WHERE ad_consent_app_push), count(*) FILTER (WHERE ad_consent_web_push),
         count(*) FILTER (WHERE ad_consent_email), count(*) FILTER (WHERE ad_consent_sms),
         count(*) FILTER (WHERE marketing_consent IS TRUE AND NOT (ad_consent_app_push AND ad_consent_web_push AND ad_consent_email AND ad_consent_sms))
    INTO a, w, e, s, mism FROM public.users;
  RAISE NOTICE '[message_engine] 옮기기 전 동의 %명, 이번에 옮김 %명, 옮긴 뒤 앱 % · 웹 % · 메일 % · 문자 %, 어긋남 %', before_n, fixed_n, a, w, e, s, mism;
END $$;

-- 옛 칸이 바뀌면 새 네 칸을 같이 바꾼다(가입·내 정보 화면은 아직 옛 칸 하나만 쓴다)
CREATE OR REPLACE FUNCTION public.sync_ad_consent_from_marketing() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.marketing_consent IS DISTINCT FROM OLD.marketing_consent THEN
    NEW.ad_consent_app_push := COALESCE(NEW.marketing_consent, false);
    NEW.ad_consent_web_push := COALESCE(NEW.marketing_consent, false);
    NEW.ad_consent_email    := COALESCE(NEW.marketing_consent, false);
    NEW.ad_consent_sms      := COALESCE(NEW.marketing_consent, false);
    NEW.ad_consent_updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER users_sync_ad_consent
  BEFORE INSERT OR UPDATE OF marketing_consent ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_ad_consent_from_marketing();

-- 2) 유형 장부 켬/끔 --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_types (
  type        TEXT PRIMARY KEY,                       -- registry.ts 의 유형 번호(P001·CAMPAIGN_AD_PUSH…)
  enabled     BOOLEAN NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID                                    -- 바꾼 관리자(사용자 id)
);
COMMENT ON TABLE public.message_types IS '메시지 유형 켬/끔. 줄이 없으면 코드 기본값(운영 중이던 것만 켬). 서버 전용';

-- 3) 받지 않을 사람 명단 -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_suppressions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       TEXT NOT NULL CHECK (channel IN ('app_push', 'web_push', 'email', 'sms', 'all')),
  address_hash  TEXT NOT NULL,                        -- sha256('email:소문자주소' / 'phone:010…' / 'user:회원번호'). 원문 없음
  address_hint  TEXT,                                 -- 메일 앞 2자 / 전화 끝 4자 / 회원번호 앞 8자
  reason        TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint', 'dead_number', 'deleted_account')),
  scope         TEXT NOT NULL CHECK (scope IN ('all', 'ad')),   -- all = 정보도 막음(반송·스팸·결번), ad = 광고만(수신 거부·탈퇴)
  source        TEXT,                                 -- unsubscribe_link · account_delete · ses_event · solapi …
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, address_hash, reason)
);
CREATE INDEX IF NOT EXISTS message_suppressions_hash_idx ON public.message_suppressions (address_hash);
COMMENT ON TABLE public.message_suppressions IS '받지 않을 사람 명단. 관문이 모든 채널 발송 직전에 본다. 서버 전용';

-- 4) message_log 칸 더하기 ----------------------------------------------
ALTER TABLE public.message_log ADD COLUMN IF NOT EXISTS msg_type     TEXT;
ALTER TABLE public.message_log ADD COLUMN IF NOT EXISTS category     TEXT;
ALTER TABLE public.message_log ADD COLUMN IF NOT EXISTS route        TEXT;
ALTER TABLE public.message_log ADD COLUMN IF NOT EXISTS campaign_key TEXT;
ALTER TABLE public.message_log ADD COLUMN IF NOT EXISTS dedupe_key   TEXT;
ALTER TABLE public.message_log ADD COLUMN IF NOT EXISTS batch_id     UUID;
ALTER TABLE public.message_log ADD COLUMN IF NOT EXISTS is_test      BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS message_log_user_sent_idx ON public.message_log (user_id, created_at DESC) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS message_log_dedupe_idx ON public.message_log (user_id, msg_type, dedupe_key, created_at DESC) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS message_log_created_idx ON public.message_log (created_at DESC);

-- 5) 캠페인 ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 TEXT NOT NULL UNIQUE CHECK (key ~ '^[0-9]{6}_[a-z0-9][a-z0-9-]{0,39}$'),   -- {YYMMDD}_{짧은이름}
  msg_type            TEXT NOT NULL,
  route               TEXT NOT NULL CHECK (route IN ('app_push', 'web_push', 'email')),       -- 문자 캠페인 없음(1차)
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  deeplink            TEXT,
  audience            JSONB NOT NULL,                                                         -- {kind:'consented'} | {kind:'user_ids', userIds:[…]}
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'test_sent', 'approved', 'scheduled', 'sending', 'sent', 'cancelled')),
  recipient_count     INTEGER,
  send_at             TIMESTAMPTZ,
  tested_at           TIMESTAMPTZ,
  approved_at         TIMESTAMPTZ,
  approved_by         UUID,
  approval_expires_at TIMESTAMPTZ,                                                            -- 승인 + 3시간
  scheduled_at        TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cursor              TEXT,                                                                   -- 어디까지 보냈나(회원 번호 순)
  stats               JSONB,
  last_error          TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_campaigns_due_idx ON public.message_campaigns (send_at) WHERE status IN ('scheduled', 'sending');
COMMENT ON TABLE public.message_campaigns IS '캠페인 = 예약 한 줄. 크론 줄을 캠페인마다 만들지 않는다. 서버 전용';

CREATE TABLE IF NOT EXISTS public.message_campaign_sends (
  campaign_id  UUID NOT NULL REFERENCES public.message_campaigns(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,                       -- 탈퇴해도 「이미 보냄」 판정이 남게 users 에 묶지 않는다
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'blocked', 'failed')),
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)                -- 같은 캠페인 + 같은 사람 = 두 번째는 저절로 막힌다
);
COMMENT ON TABLE public.message_campaign_sends IS '캠페인 받는 사람별 결과. 겹칠 수 없는 열쇠로 두 번 보내기를 막는다. 서버 전용';

-- 잠금: 새 표는 서버(service_role)만 ---------------------------------------
ALTER TABLE public.message_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_suppressions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_campaign_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_types          FROM anon, authenticated;
REVOKE ALL ON public.message_suppressions   FROM anon, authenticated;
REVOKE ALL ON public.message_campaigns      FROM anon, authenticated;
REVOKE ALL ON public.message_campaign_sends FROM anon, authenticated;

-- 6) 보냄·막힘 기록 보기 ---------------------------------------------------
CREATE INDEX IF NOT EXISTS push_sends_batch_idx ON public.push_sends (batch_id);
-- security_invoker = 읽는 사람의 권한으로 본다(message_log 의 RLS 가 그대로 걸린다). 브라우저 권한은 회수
CREATE OR REPLACE VIEW public.message_log_unified WITH (security_invoker = true) AS
SELECT l.id,
       l.created_at,
       l.user_id,
       l.channel,
       COALESCE(l.route, CASE WHEN l.channel = 'push' AND l.subject ~ '^\[[A-Za-z0-9_]+\]' THEN 'app_push' WHEN l.channel = 'push' THEN 'web_push' ELSE l.channel END) AS route,
       COALESCE(l.msg_type, substring(l.subject FROM '^\[([A-Za-z0-9_]+)\]')) AS msg_type,
       l.category,
       l.campaign_key,
       l.dedupe_key,
       l.status,
       l.error AS reason,
       l.to_hint,
       l.is_test,
       l.permission_request_id IS NOT NULL AS to_other,
       l.batch_id,
       (SELECT count(*) FROM public.push_sends p WHERE l.batch_id IS NOT NULL AND p.batch_id = l.batch_id AND p.status = 'sent')::int AS devices_sent,
       (SELECT max(p.opened_at) FROM public.push_sends p WHERE l.batch_id IS NOT NULL AND p.batch_id = l.batch_id) AS opened_at
  FROM public.message_log l
 WHERE l.status <> 'pending';
REVOKE ALL ON public.message_log_unified FROM anon, authenticated;
COMMENT ON VIEW public.message_log_unified IS '보냄·막힘 기록 한 곳. message_log + 앱 푸시 기기별 줄(push_sends, 묶음 번호로 이음). 관리자 화면 /admin/os/messages';
