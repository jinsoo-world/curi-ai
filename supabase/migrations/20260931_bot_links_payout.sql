-- ============================================================
-- 2026-09-31 봇 마켓 연동 + 리더 정산 정보 — 표 2개 신설, team_bots 칸 1개 추가. 기존 표의 다른 칸은 건드리지 않는다.
--
--   team_bots.linked_from_market = 마켓(/mentors)에서 「내 팀에 추가」로 들어온 봇인가.
--       내가 만든 봇(false)만 무료. 연동한 봇(true)은 마켓 클로버 규칙 그대로(유료).
--   bot_links            = 누가 어느 봇을 팀에 넣었나(연동 기록). 한 사람 × 한 봇 = 한 줄.
--                          팀에서 빼면 지우지 않고 active=false (다시 넣어도 알림 도배가 안 된다).
--   mentor_link_counts   = 봇마다 「N명이 팀에 넣었어요」 숫자. 칸을 늘리지 않고 매번 센다(뷰).
--   creator_payout_profiles = 리더 정산 정보(이름·이메일·휴대폰·생년월일·은행·계좌·예금주·동의 시각).
--       🔐 계좌번호는 그대로 넣지 않는다. CONNECTOR_SECRET_KEY 로 AES-256-GCM 잠금(src/domains/connectors/crypto.ts).
--       화면에는 뒤 4자리(account_last4)만 나간다.
--
-- 원칙: RLS 켬 + 본인 행만. 정산 정보는 브라우저에서 쓰지 못한다(service_role 만). API 가 user_id 를 반드시 검사한다.
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행 (여러 번 실행해도 안전).
-- ============================================================

-- 1) team_bots 에 「마켓에서 연동한 봇인가」 칸
ALTER TABLE public.team_bots ADD COLUMN IF NOT EXISTS linked_from_market BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.team_bots.linked_from_market IS '마켓에서 「내 팀에 추가」로 들어온 봇 = true. 내가 만든 봇(false)만 무료';

-- 2) 연동 기록
CREATE TABLE IF NOT EXISTS public.bot_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id         UUID NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  active            BOOLEAN NOT NULL DEFAULT true,       -- 팀에서 빼면 false. 줄은 남긴다
  last_notified_at  TIMESTAMPTZ,                         -- 봇 주인에게 마지막으로 알린 시각(하루 1회 제한)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mentor_id, user_id)
);
CREATE INDEX IF NOT EXISTS bot_links_mentor_active_idx ON public.bot_links (mentor_id, active);
CREATE INDEX IF NOT EXISTS bot_links_user_idx ON public.bot_links (user_id);
COMMENT ON TABLE public.bot_links IS '누가 어느 봇을 팀에 넣었나. 팀에서 빼면 active=false. 숫자는 mentor_link_counts 뷰로 센다';

-- 팀에서 빼는 길이 둘(마켓 상세의 「팀에서 빼기」, OS 명단의 「빼기」)이라 어느 길로 빼도 기록이 맞게 트리거로 잇는다
CREATE OR REPLACE FUNCTION public.bot_links_deactivate_on_team_remove() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.bot_links SET active = false
   WHERE mentor_id = OLD.mentor_id AND user_id = OLD.user_id AND active = true;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS team_bots_deactivate_bot_link ON public.team_bots;
CREATE TRIGGER team_bots_deactivate_bot_link
  AFTER DELETE ON public.team_bots
  FOR EACH ROW EXECUTE FUNCTION public.bot_links_deactivate_on_team_remove();

-- 3) 봇마다 연동 수 (칸 추가 없이 매번 센다). 이번 달 = 한국 시간 기준
CREATE OR REPLACE VIEW public.mentor_link_counts AS
  SELECT
    mentor_id,
    COUNT(*) FILTER (WHERE active)                                                                  AS link_count,
    COUNT(*) FILTER (WHERE active AND (created_at AT TIME ZONE 'Asia/Seoul')
                                        >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Seoul'))   AS month_new
  FROM public.bot_links
  GROUP BY mentor_id;
COMMENT ON VIEW public.mentor_link_counts IS '봇별 「N명이 팀에 넣었어요」. 공개 숫자(마켓 카드에 나간다)';
GRANT SELECT ON public.mentor_link_counts TO anon, authenticated, service_role;

-- 4) 리더 정산 정보 (사용자당 한 줄)
CREATE TABLE IF NOT EXISTS public.creator_payout_profiles (
  user_id                   UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  legal_name                TEXT NOT NULL,
  email                     TEXT NOT NULL,
  phone                     TEXT NOT NULL,
  birth_date                DATE NOT NULL,
  bank_name                 TEXT NOT NULL,
  account_number_encrypted  TEXT NOT NULL,     -- 🔐 "v1.iv.tag.암호문". 평문 금지
  account_last4             TEXT NOT NULL,     -- 화면용 뒤 4자리
  account_holder            TEXT NOT NULL,
  agreed_at                 TIMESTAMPTZ NOT NULL,   -- 개인정보 수집 동의 시각
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE  public.creator_payout_profiles IS '리더 정산 정보. 계좌는 잠가서 넣고 뒤 4자리만 보여 준다. 쓰기는 서버(service_role)만';
COMMENT ON COLUMN public.creator_payout_profiles.account_number_encrypted IS '잠긴 계좌번호. 자물쇠는 CONNECTOR_SECRET_KEY. 평문을 넣지 마라';

-- ---------- RLS ----------
ALTER TABLE public.bot_links               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_payout_profiles ENABLE ROW LEVEL SECURITY;

-- 연동 기록: 내가 넣은 줄 + 내가 만든 봇에 달린 줄만 읽는다. 쓰기는 서버만(정책 없음)
DROP POLICY IF EXISTS "bot_links_select_own_or_owner" ON public.bot_links;
CREATE POLICY "bot_links_select_own_or_owner" ON public.bot_links
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.mentors m
      JOIN public.creator_profiles cp ON cp.id = m.creator_id
      WHERE m.id = bot_links.mentor_id AND cp.user_id = auth.uid()
    )
  );

-- 정산 정보: 본인만 읽는다. 쓰기는 서버만(정책 없음 = 브라우저에서 INSERT/UPDATE 불가)
DROP POLICY IF EXISTS "payout_select_own" ON public.creator_payout_profiles;
CREATE POLICY "payout_select_own" ON public.creator_payout_profiles
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON public.bot_links TO authenticated;
GRANT ALL    ON public.bot_links TO service_role;
GRANT SELECT ON public.creator_payout_profiles TO authenticated;
GRANT ALL    ON public.creator_payout_profiles TO service_role;
