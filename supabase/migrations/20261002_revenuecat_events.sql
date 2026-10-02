-- ============================================================
-- 2026-10-02 앱 안 구독(레비뉴캣) 받을 준비 — 표 1개 신설 + user_plans 에 읽기 전용 칸 1개.
--
--   대표 결정 1002: 아이폰·안드로이드 구독은 레비뉴캣(RevenueCat)으로 받는다. 웹은 토스 그대로.
--   레비뉴캣 웹훅(/api/billing/revenuecat/webhook)이 토스와 같은 user_plans 한 줄을 고친다.
--   어디서 열렸는지는 last_order_id 접두사로 안다 (토스 plan_… / 레비뉴캣 revenuecat:<알림 id>).
--
--   ① revenuecat_events = 받은 알림 한 건 한 건. id(레비뉴캣 event.id)가 겹치면 다시 처리하지 않는다.
--      결제 기록이라 탈퇴해도 5년 보관하고 사람만 뗀다(deleted_user_ref, domains/account/delete.ts RETAINED_TABLES).
--   ② user_plans.source = last_order_id 에서 저절로 계산되는 칸(아무도 직접 쓰지 않는다).
--      코드가 이 칸을 쓰지 않으므로, 이 파일을 적용하기 전에 배포해도 토스 결제는 깨지지 않는다.
--
-- 원칙: RLS 켬. 회원(anon·authenticated)은 이 표를 못 읽고 못 쓴다. 쓰기·읽기는 서버(service_role)만.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전). ⚠️ 아직 적용하지 않았다.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.revenuecat_events (
  id                TEXT PRIMARY KEY,                    -- 레비뉴캣 event.id
  type              TEXT NOT NULL,                       -- INITIAL_PURCHASE, RENEWAL, EXPIRATION …
  app_user_id       TEXT,                                -- 레비뉴캣 app_user_id (앱이 logIn 한 우리 회원번호)
  user_id           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  environment       TEXT,                                -- PRODUCTION | SANDBOX
  outcome           TEXT NOT NULL,                       -- set | ignored | unknown_user
  reason            TEXT,
  payload           JSONB,
  deleted_user_ref  TEXT,                                -- 탈퇴한 회원의 익명 표식
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS revenuecat_events_user_idx ON public.revenuecat_events (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS revenuecat_events_deleted_user_ref_idx ON public.revenuecat_events (deleted_user_ref) WHERE deleted_user_ref IS NOT NULL;

COMMENT ON TABLE  public.revenuecat_events         IS '레비뉴캣(앱 안 구독) 웹훅 알림. 같은 id 는 한 번만 처리. 서버 전용';
COMMENT ON COLUMN public.revenuecat_events.outcome IS 'set = user_plans 를 고침 / ignored = 바꿀 것 없음 / unknown_user = 회원을 못 찾음';

ALTER TABLE public.revenuecat_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.revenuecat_events FROM anon, authenticated;
GRANT ALL ON public.revenuecat_events TO service_role;
-- 정책(POLICY)을 하나도 두지 않는다 = 회원 화면에서는 한 줄도 안 보인다

-- ---------- user_plans.source (읽기 전용, 저절로 계산) ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_plans' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.user_plans
      ADD COLUMN source TEXT GENERATED ALWAYS AS (
        CASE
          WHEN last_order_id LIKE 'revenuecat:%' THEN 'revenuecat'
          WHEN last_order_id LIKE 'plan\_%' THEN 'toss'
          ELSE NULL
        END
      ) STORED;
  END IF;
END $$;

COMMENT ON COLUMN public.user_plans.source IS 'toss(웹) | revenuecat(앱). last_order_id 에서 저절로 계산. 직접 쓰지 않는다';
COMMENT ON COLUMN public.user_plans.plan   IS 'free | basic(월 9,900) | pro(월 39,000). 가격 대표 결정 2026-10-02';
