-- guest_chat_logs 테이블 권한 수정
-- Supabase SQL 에디터에서 실행해주세요

-- 1. 기존 테이블에 권한 부여 (service_role이 접근 가능하도록)
GRANT ALL ON guest_chat_logs TO service_role;
GRANT ALL ON guest_chat_logs TO authenticated;
GRANT SELECT ON guest_chat_logs TO anon;

-- 2. RLS 정책 확인 및 추가
ALTER TABLE guest_chat_logs ENABLE ROW LEVEL SECURITY;

-- service_role은 모든 작업 가능
CREATE POLICY IF NOT EXISTS "service_role_all" ON guest_chat_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 비회원 대화 삽입 허용 (anon 사용자)
CREATE POLICY IF NOT EXISTS "anon_insert" ON guest_chat_logs
  FOR INSERT TO anon WITH CHECK (true);

-- 인증된 사용자 조회 허용 (admin 페이지용)  
CREATE POLICY IF NOT EXISTS "authenticated_select" ON guest_chat_logs
  FOR SELECT TO authenticated USING (true);
