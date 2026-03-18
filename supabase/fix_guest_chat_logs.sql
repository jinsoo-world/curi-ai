-- =========================================
-- 사용자 분석 데이터 수집 시스템 마이그레이션
-- Supabase SQL 에디터에서 실행하세요
-- =========================================

-- ── 1. guest_chat_logs 테이블 권한 수정 ──
GRANT ALL ON guest_chat_logs TO service_role;
GRANT ALL ON guest_chat_logs TO authenticated;
GRANT SELECT ON guest_chat_logs TO anon;

ALTER TABLE guest_chat_logs ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 후 재생성 (에러 방지)
DROP POLICY IF EXISTS "service_role_all" ON guest_chat_logs;
CREATE POLICY "service_role_all" ON guest_chat_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert" ON guest_chat_logs;
CREATE POLICY "anon_insert" ON guest_chat_logs
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select" ON guest_chat_logs;
CREATE POLICY "authenticated_select" ON guest_chat_logs
  FOR SELECT TO authenticated USING (true);

-- ── 2. guest_chat_logs 분석 컬럼 추가 ── 
ALTER TABLE guest_chat_logs ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE guest_chat_logs ADD COLUMN IF NOT EXISTS device_type text;  -- mobile / desktop / tablet
ALTER TABLE guest_chat_logs ADD COLUMN IF NOT EXISTS os text;           -- iOS / Android / Windows / macOS
ALTER TABLE guest_chat_logs ADD COLUMN IF NOT EXISTS browser text;      -- Chrome / Safari / etc
ALTER TABLE guest_chat_logs ADD COLUMN IF NOT EXISTS country text;      -- KR / US / JP
ALTER TABLE guest_chat_logs ADD COLUMN IF NOT EXISTS city text;         -- Seoul / Busan
ALTER TABLE guest_chat_logs ADD COLUMN IF NOT EXISTS visitor_id text;   -- 쿠키 기반 익명 ID (재방문 추적)

-- ── 3. messages 테이블 분석 컬럼 추가 (회원 대화) ──
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS city text;

-- ── 4. users 테이블 전환 추적 ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS visitor_id text;  -- 비회원→회원 전환 매핑

-- ── 5. 인덱스 (조회 성능 최적화) ──
CREATE INDEX IF NOT EXISTS idx_guest_logs_visitor ON guest_chat_logs(visitor_id);
CREATE INDEX IF NOT EXISTS idx_guest_logs_country ON guest_chat_logs(country);
CREATE INDEX IF NOT EXISTS idx_guest_logs_created ON guest_chat_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_country ON messages(country);
CREATE INDEX IF NOT EXISTS idx_users_visitor ON users(visitor_id);
