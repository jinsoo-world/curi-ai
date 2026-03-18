const { createClient } = require('./node_modules/@supabase/supabase-js')
const fs = require('fs')
const env = {}
fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const [k,...v]=l.split('=');if(k&&v.length)env[k.trim()]=v.join('=').trim()})
const db = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {auth:{autoRefreshToken:false,persistSession:false}})

;(async()=>{
    // guest_chat_logs 테이블 존재 여부 확인
    const { error } = await db.from('guest_chat_logs').select('id').limit(1)
    if (error && error.message.includes('does not exist')) {
        console.log('guest_chat_logs 테이블 없음. Supabase Dashboard SQL Editor에서 실행하세요:')
        console.log(`
CREATE TABLE guest_chat_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    mentor_id uuid,
    mentor_name text,
    user_message text,
    ai_response text,
    message_index int DEFAULT 1,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_guest_logs_created ON guest_chat_logs(created_at DESC);
CREATE INDEX idx_guest_logs_mentor ON guest_chat_logs(mentor_id);
        `)
    } else {
        console.log('guest_chat_logs 테이블 이미 존재')
    }
})()
