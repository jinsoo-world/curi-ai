const path = require('path')
const { createClient } = require(path.join(__dirname, 'node_modules/@supabase/supabase-js'))
const fs = require('fs')
const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8')
const env = {}
envContent.split('\n').forEach(l => { const [k,...v] = l.split('='); if(k&&v.length) env[k.trim()]=v.join('=').trim() })
const db = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { autoRefreshToken: false, persistSession: false } })

async function run() {
    // 1. mentor_match_logs 테이블 생성
    const { error: e1 } = await db.rpc('exec_sql', { sql: `
        CREATE TABLE IF NOT EXISTS mentor_match_logs (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id uuid REFERENCES auth.users(id),
            concern text NOT NULL,
            matched_mentor_id uuid,
            matched_mentor_name text,
            match_reason text,
            match_type text DEFAULT 'keyword',
            is_guest boolean DEFAULT false,
            clicked_start boolean DEFAULT false,
            created_at timestamptz DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_match_logs_created ON mentor_match_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_match_logs_user ON mentor_match_logs(user_id);
    `})

    if (e1) {
        // rpc 실패 → 직접 SQL 없이 테이블 확인
        console.log('RPC 실패 (정상일 수 있음):', e1.message)
        
        // 대안: 테이블이 이미 있는지 확인
        const { error: checkErr } = await db.from('mentor_match_logs').select('id').limit(1)
        if (checkErr && checkErr.message.includes('does not exist')) {
            console.log('❌ mentor_match_logs 테이블이 없습니다. Supabase Dashboard에서 수동 생성 필요:')
            console.log(`
CREATE TABLE mentor_match_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    concern text NOT NULL,
    matched_mentor_id uuid,
    matched_mentor_name text,
    match_reason text,
    match_type text DEFAULT 'keyword',
    is_guest boolean DEFAULT false,
    clicked_start boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);`)
        } else {
            console.log('✅ mentor_match_logs 테이블 존재')
        }
    } else {
        console.log('✅ mentor_match_logs 테이블 생성 완료')
    }

    // 2. user_concerns 테이블 확인/생성
    const { error: e2 } = await db.rpc('exec_sql', { sql: `
        CREATE TABLE IF NOT EXISTS user_concerns (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES auth.users(id),
            concern text NOT NULL,
            matched_mentor_id uuid,
            matched_mentor_name text,
            status text DEFAULT 'active',
            resolved_at timestamptz,
            created_at timestamptz DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_concerns_user ON user_concerns(user_id);
        CREATE INDEX IF NOT EXISTS idx_concerns_active ON user_concerns(status) WHERE status = 'active';
    `})

    if (e2) {
        const { error: checkErr2 } = await db.from('user_concerns').select('id').limit(1)
        if (checkErr2 && checkErr2.message.includes('does not exist')) {
            console.log('❌ user_concerns 테이블이 없습니다. Supabase Dashboard에서 수동 생성 필요:')
            console.log(`
CREATE TABLE user_concerns (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    concern text NOT NULL,
    matched_mentor_id uuid,
    matched_mentor_name text,
    status text DEFAULT 'active',
    resolved_at timestamptz,
    created_at timestamptz DEFAULT now()
);`)
        } else {
            console.log('✅ user_concerns 테이블 존재')
        }
    } else {
        console.log('✅ user_concerns 테이블 생성 완료')
    }
}

run().catch(console.error)
