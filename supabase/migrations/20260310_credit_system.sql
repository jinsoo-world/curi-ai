-- ============================================
-- 크레딧 시스템 마이그레이션
-- Sprint R1-6: 크레딧 DB 스키마
-- 실행: Supabase Dashboard > SQL Editor
-- ============================================

-- 1. users 테이블에 credit_balance 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_balance INTEGER DEFAULT 0;

-- 2. users 테이블에 CRM 필드 추가 (R1-3 크레딧 모달에서 사용)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_year INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_agreed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle TEXT UNIQUE;

-- 3. credit_transactions 테이블 생성
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    amount INTEGER NOT NULL,              -- 양수=충전, 음수=차감
    balance_after INTEGER NOT NULL,       -- 트랜잭션 후 잔액
    type TEXT NOT NULL,                   -- 'signup_bonus','purchase','chat_usage','refund','admin_grant','promo'
    description TEXT,
    mentor_id UUID REFERENCES mentors(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_credit_tx_user 
    ON credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_type 
    ON credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_users_handle 
    ON users(handle) WHERE handle IS NOT NULL;

-- 5. RLS 정책 설정
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- 유저 본인 트랜잭션만 조회 가능
CREATE POLICY "Users can view own credit transactions"
    ON credit_transactions
    FOR SELECT
    USING (auth.uid() = user_id);

-- 서버(service_role)만 트랜잭션 생성 가능
CREATE POLICY "Service role can insert credit transactions"
    ON credit_transactions
    FOR INSERT
    WITH CHECK (true);

-- 6. 권한 부여
GRANT SELECT ON credit_transactions TO authenticated;
GRANT INSERT ON credit_transactions TO service_role;
GRANT ALL ON credit_transactions TO service_role;

-- ============================================
-- 확인: SELECT * FROM credit_transactions LIMIT 5;
-- ============================================
