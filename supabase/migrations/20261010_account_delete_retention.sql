-- ============================================================
-- 2026-10-10 회원 탈퇴용: 결제·크레딧·구독 기록을 5년 보관하되 사람과 분리할 수 있게 한다.
--   (전자상거래법: 대금결제·재화 공급 기록 5년. 개인정보처리방침 제3조)
--
--  탈퇴 API(/api/account/delete)는 이 3개 표에서 user_id 를 비우고 deleted_user_ref 에 표식을 넣는다.
--  이 마이그레이션이 없으면 API 는 「결제기록 분리」 단계에서 멈추고 아무것도 지우지 않는다(안전 장치).
--  ⚠️ 자동 적용되지 않는다. Supabase SQL 편집기에 통째로 붙여 직접 실행한다(여러 번 실행해도 안전).
-- ============================================================

DO $$
DECLARE
  t text;
  fk record;
BEGIN
  FOREACH t IN ARRAY ARRAY['credit_transactions', 'payments', 'subscriptions'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '% 표가 없어 건너뜀', t;
      CONTINUE;
    END IF;

    -- 1) 탈퇴 후 남는 줄을 가리킬 익명 표식 (원래 id 로 되돌릴 수 없는 해시)
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_user_ref text', t);

    -- 2) user_id 를 비울 수 있게
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id DROP NOT NULL', t);

    -- 3) users/auth.users 를 가리키는 외래키(연쇄 삭제)를 「삭제 시 NULL」 로 교체
    FOR fk IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.conrelid = ('public.' || t)::regclass
        AND c.contype = 'f'
        AND a.attname = 'user_id'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, fk.conname);
    END LOOP;
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL',
      t, t || '_user_id_fkey'
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (deleted_user_ref) WHERE deleted_user_ref IS NOT NULL',
      t || '_deleted_user_ref_idx', t
    );
  END LOOP;
END $$;

COMMENT ON COLUMN public.credit_transactions.deleted_user_ref IS '탈퇴한 회원의 익명 표식. user_id 는 비워지고 기록만 5년 보관한다';

-- ============================================================
-- 탈퇴한 리더의 정산 정보 1년 보관함 (대표 확정 2026-10-01 「1년」)
--   탈퇴 API 가 creator_payout_profiles 한 줄을 사람 id 없이 여기로 옮기고 원래 줄을 지운다.
--   retain_until 이 지나면 매일 예약 작업(/api/cron/retention-purge)이 지운다.
--   계좌번호는 원래처럼 잠긴 채(account_number_encrypted) 옮긴다. 평문 금지.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.retained_payout_profiles (
  deleted_user_ref          TEXT PRIMARY KEY,
  legal_name                TEXT,
  email                     TEXT,
  phone                     TEXT,
  birth_date                DATE,
  bank_name                 TEXT,
  account_number_encrypted  TEXT,
  account_last4             TEXT,
  account_holder            TEXT,
  agreed_at                 TIMESTAMPTZ,
  retain_until              TIMESTAMPTZ NOT NULL,
  moved_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS retained_payout_profiles_retain_until_idx ON public.retained_payout_profiles (retain_until);
COMMENT ON TABLE public.retained_payout_profiles IS '탈퇴한 리더의 정산 정보. 1년 보관 후 파기. 쓰기·읽기는 서버(service_role)만';

-- RLS 켜고 정책 0개 = 손님·로그인 회원은 못 본다. 서버 열쇠만 접근
ALTER TABLE public.retained_payout_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retained_payout_profiles FROM anon, authenticated;
