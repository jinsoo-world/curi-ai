-- ============================================================
-- 2026-09-29 요금제(user_plans) — 표 1개 신설. 기존 표는 건드리지 않는다.
--
--   대표 확정 0923: 클로버 충전 화면 → 요금제 화면 (무료 / 베이직 월 29,000원 / 프로 월 99,000원)
--   user_plans = 사람 한 명당 한 줄. 지금 어떤 요금제인지, 언제 끝나는지.
--   행이 없으면 무료. 기한(expires_at)이 지나도 무료로 본다(코드 resolvePlan).
--
--   last_order_id = 마지막으로 승인된 토스 주문번호(plan_basic_… / plan_pro_…).
--   같은 결제를 새로고침·재시도로 두 번 반영하지 않기 위한 표식.
--
-- 원칙: RLS 켬 + 본인 SELECT 만. 쓰기는 서버(service_role)가 토스 승인 검증 뒤에만 한다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_plans (
  user_id        UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  plan           TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro')),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,                       -- NULL = 기한 없음(무료)
  last_order_id  TEXT,                              -- 마지막 승인 주문번호. 두 번 반영 방지
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_plans_last_order_idx ON public.user_plans (last_order_id);

COMMENT ON TABLE  public.user_plans               IS '큐리AI 요금제. 사람당 한 줄. 행 없음 = 무료';
COMMENT ON COLUMN public.user_plans.plan          IS 'free | basic(29,000) | pro(99,000)';
COMMENT ON COLUMN public.user_plans.expires_at    IS '이 시각이 지나면 무료로 본다. 자동 갱신(빌링키)은 아직 없다';
COMMENT ON COLUMN public.user_plans.last_order_id IS '마지막 승인된 토스 주문번호. 같은 결제 두 번 반영 방지';

-- ---------- RLS: 본인 SELECT 만. 쓰기는 service_role 만 ----------
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_plans_select_own" ON public.user_plans;
CREATE POLICY "user_plans_select_own" ON public.user_plans
  FOR SELECT USING (auth.uid() = user_id);

REVOKE ALL ON public.user_plans FROM anon, authenticated;
GRANT SELECT ON public.user_plans TO authenticated;
GRANT ALL ON public.user_plans TO service_role;
