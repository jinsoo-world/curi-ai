-- ============================================================
-- 2026-10-23 「통째로 멈춤」 전수점검 후속 — 예약 작업·결제·파일 학습 (PR fix/jobs-payments-resilience)
--
-- 덧붙이기만 한다. 지우는 표·칸·행 없음. 여러 번 실행해도 안전(IF NOT EXISTS · CREATE OR REPLACE · NOT VALID).
-- 적용 순서: 이 파일 먼저 → 그다음 코드 배포. (코드가 새 칸 next_run_at·fail_count·claimed_at 을 읽는다)
--
--   1) 예약 작업 공통 칸: knowledge_syncs · bot_routines · message_campaigns (+ knowledge_feeds 칸만)
--      next_run_at(다음에 돌 시각) · fail_count(연속 실패) · claimed_at(지금 누가 잡았나) · last_error · status 'paused'
--   2) subscriptions.status 에 'renewing'(갱신 중 잡음)·'renew_paid_unsynced'(돈은 나갔는데 DB 반영 실패)·'past_due' 허용
--   3) knowledge_sources.processing_started_at (읽기 시작 시각 → 30분 넘으면 정리 작업이 failed(timeout))
--   4) credit_transactions: 같은 충전 주문번호로 두 번 지급 못 하게 겹칠 수 없는 열쇠(이미 겹친 줄이 있으면 건너뛰고 알림만)
--   5) p089_candidates(): 「3일 안부」 받을 사람을 SQL 한 번으로 고른다
--   6) llm_cost_report(): AI 비용 매일 보고용 회사별 · 손님/무료/유료별 합계
-- ============================================================

-- ---------- 1) 예약 작업 공통 칸 ----------

-- knowledge_syncs (드라이브·노션 가져오기)
ALTER TABLE public.knowledge_syncs ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.knowledge_syncs ADD COLUMN IF NOT EXISTS fail_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.knowledge_syncs ADD COLUMN IF NOT EXISTS claimed_at  TIMESTAMPTZ;
ALTER TABLE public.knowledge_syncs ADD COLUMN IF NOT EXISTS last_error  TEXT;
UPDATE public.knowledge_syncs SET next_run_at = NOW() WHERE next_run_at IS NULL;
ALTER TABLE public.knowledge_syncs DROP CONSTRAINT IF EXISTS knowledge_syncs_status_check;
ALTER TABLE public.knowledge_syncs ADD CONSTRAINT knowledge_syncs_status_check CHECK (status IN ('pending', 'ok', 'error', 'paused'));
CREATE INDEX IF NOT EXISTS knowledge_syncs_next_run_idx ON public.knowledge_syncs (next_run_at) WHERE status <> 'paused';

-- bot_routines (루틴). 루틴은 「몇 시에 도나」가 따로 있어 next_run_at 은 공통 칸으로만 둔다
ALTER TABLE public.bot_routines ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.bot_routines ADD COLUMN IF NOT EXISTS fail_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.bot_routines ADD COLUMN IF NOT EXISTS claimed_at  TIMESTAMPTZ;
ALTER TABLE public.bot_routines ADD COLUMN IF NOT EXISTS last_error  TEXT;
ALTER TABLE public.bot_routines ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'active';
UPDATE public.bot_routines SET next_run_at = NOW() WHERE next_run_at IS NULL;
ALTER TABLE public.bot_routines DROP CONSTRAINT IF EXISTS bot_routines_status_check;
ALTER TABLE public.bot_routines ADD CONSTRAINT bot_routines_status_check CHECK (status IN ('active', 'paused'));
CREATE INDEX IF NOT EXISTS bot_routines_enabled_id_idx ON public.bot_routines (id) WHERE enabled;

-- message_campaigns (캠페인). 3번 연속 실패하면 paused
ALTER TABLE public.message_campaigns ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;
ALTER TABLE public.message_campaigns ADD COLUMN IF NOT EXISTS fail_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.message_campaigns ADD COLUMN IF NOT EXISTS claimed_at  TIMESTAMPTZ;
ALTER TABLE public.message_campaigns ADD COLUMN IF NOT EXISTS last_error  TEXT;
UPDATE public.message_campaigns SET next_run_at = send_at WHERE next_run_at IS NULL AND send_at IS NOT NULL;
ALTER TABLE public.message_campaigns DROP CONSTRAINT IF EXISTS message_campaigns_status_check;
ALTER TABLE public.message_campaigns ADD CONSTRAINT message_campaigns_status_check
  CHECK (status IN ('draft', 'test_sent', 'approved', 'scheduled', 'sending', 'sent', 'cancelled', 'paused'));
-- 1시간 넘게 pending 으로 남은 받는 사람 줄(보내다 함수가 죽음)을 다시 찾는 길
CREATE INDEX IF NOT EXISTS message_campaign_sends_pending_idx ON public.message_campaign_sends (campaign_id, created_at) WHERE status = 'pending';

-- knowledge_feeds (SNS 가져오기) — 칸만 같이 둔다. 쓰는 코드는 SNS 작업(feeds) 쪽. status 는 이미 'paused' 허용
DO $$
BEGIN
  IF to_regclass('public.knowledge_feeds') IS NOT NULL THEN
    ALTER TABLE public.knowledge_feeds ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.knowledge_feeds ADD COLUMN IF NOT EXISTS fail_count  INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.knowledge_feeds ADD COLUMN IF NOT EXISTS claimed_at  TIMESTAMPTZ;
    ALTER TABLE public.knowledge_feeds ADD COLUMN IF NOT EXISTS last_error  TEXT;
    UPDATE public.knowledge_feeds SET next_run_at = NOW() WHERE next_run_at IS NULL;
  END IF;
END $$;

-- ---------- 2) 자동결제 갱신 상태 ----------
-- NOT VALID = 지금 있는 줄은 검사하지 않는다(예전 상태값이 남아 있어도 이 파일이 실패하지 않게). 새로 쓰는 값만 검사
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'expired', 'trial', 'past_due', 'renewing', 'renew_paid_unsynced')) NOT VALID;
CREATE INDEX IF NOT EXISTS subscriptions_renew_due_idx ON public.subscriptions (current_period_end) WHERE status IN ('active', 'renewing');

-- ---------- 3) 파일 학습 시작 시각 ----------
ALTER TABLE public.knowledge_sources ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS knowledge_sources_stuck_idx ON public.knowledge_sources (created_at) WHERE processing_status IN ('pending', 'processing');

-- ---------- 4) 충전 두 번 지급 막기 ----------
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_purchase_order_uniq
      ON public.credit_transactions (description) WHERE type = 'purchase';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '이미 같은 주문번호로 두 번 지급된 줄이 있어 열쇠를 만들지 못했다. 그 줄을 먼저 확인할 것 (코드는 열쇠 없이도 예전처럼 동작)';
  END;
END $$;

-- ---------- 5) 「3일 안부」 받을 사람 고르기 (SQL 한 번) ----------
-- 규칙은 domains/push/checkin.ts 와 같다:
--   꺼지지 않은 기기 중 가장 최근 접속이 (지금-4일, 지금-3일] · 3일 안에 직접 말하지 않음(웹 대화·단체방)
--   · 앱 광고 동의 · 7일 안에 P089 를 「보냄」으로 받지 않음 · 최대 p_limit 명
CREATE OR REPLACE FUNCTION public.p089_candidates(p_now TIMESTAMPTZ, p_limit INTEGER DEFAULT 500)
RETURNS TABLE (user_id UUID, mentor_id UUID, bot_name TEXT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH last_seen AS (
    SELECT d.user_id, max(d.last_seen_at) AS seen
      FROM public.push_devices d
     WHERE d.disabled_at IS NULL AND d.last_seen_at > p_now - interval '4 days'
     GROUP BY d.user_id
  ), win AS (
    SELECT ls.user_id, ls.seen FROM last_seen ls WHERE ls.seen <= p_now - interval '3 days'
  )
  SELECT w.user_id,
         (SELECT tb.mentor_id FROM public.team_bots tb JOIN public.mentors m ON m.id = tb.mentor_id
           WHERE tb.user_id = w.user_id AND m.name = '기획팀장' LIMIT 1) AS mentor_id,
         '기획팀장'::text AS bot_name
    FROM win w
    JOIN public.users u ON u.id = w.user_id AND u.ad_consent_app_push = true
   WHERE NOT EXISTS (
           SELECT 1 FROM public.push_sends ps
            WHERE ps.user_id = w.user_id AND ps.push_type = 'P089' AND ps.status = 'sent'
              AND ps.sent_at >= p_now - interval '7 days')
     AND NOT EXISTS (
           SELECT 1 FROM public.messages msg JOIN public.chat_sessions cs ON cs.id = msg.session_id
            WHERE cs.user_id = w.user_id AND msg.role = 'user' AND msg.created_at >= p_now - interval '3 days')
     AND NOT EXISTS (
           SELECT 1 FROM public.channel_messages cm JOIN public.channels ch ON ch.id = cm.channel_id
            WHERE ch.user_id = w.user_id AND cm.author_kind = 'user' AND cm.created_at >= p_now - interval '3 days')
   ORDER BY w.seen
   LIMIT greatest(1, least(coalesce(p_limit, 500), 2000));
$$;
REVOKE ALL ON FUNCTION public.p089_candidates(TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p089_candidates(TIMESTAMPTZ, INTEGER) TO service_role;

-- ---------- 6) AI 비용 보고 합계 ----------
-- 회사(provider) × 손님/무료/유료. 손님 = user_id 없음, 유료 = user_plans 가 basic·pro 이고 기한이 안 지남(domains/os/plan.ts resolvePlan 과 같은 규칙)
CREATE OR REPLACE FUNCTION public.llm_cost_report(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (provider TEXT, segment TEXT, calls BIGINT, cost_krw NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce(l.provider, '모름') AS provider,
         CASE WHEN l.user_id IS NULL THEN 'guest'
              WHEN up.plan IN ('basic', 'pro') AND (up.expires_at IS NULL OR up.expires_at > l.created_at) THEN 'paid'
              ELSE 'free' END AS segment,
         count(*) AS calls,
         round(coalesce(sum(l.cost_krw), 0), 0) AS cost_krw
    FROM public.llm_usage l
    LEFT JOIN public.user_plans up ON up.user_id = l.user_id
   WHERE l.created_at >= p_from AND l.created_at < p_to
   GROUP BY 1, 2;
$$;
REVOKE ALL ON FUNCTION public.llm_cost_report(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_cost_report(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
