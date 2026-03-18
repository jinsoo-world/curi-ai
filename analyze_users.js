const { createClient } = require('./node_modules/@supabase/supabase-js')
const fs = require('fs')
const env = {}
fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const [k,...v]=l.split('=');if(k&&v.length)env[k.trim()]=v.join('=').trim()})
const db = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {auth:{autoRefreshToken:false,persistSession:false}})

;(async()=>{
    const {data:msgs} = await db.from('messages').select('id, session_id, role, created_at')
    const {data:sessions} = await db.from('chat_sessions').select('id, user_id, mentor_id, message_count, created_at')
    const {data:mentors} = await db.from('mentors').select('id, name')
    const mMap = {}
    mentors.forEach(m => mMap[m.id] = m.name)
    const {data:users} = await db.from('users').select('id, email, display_name')
    const uMap = {}
    users.forEach(u => { uMap[u.id] = u.display_name || (u.email ? u.email.split('@')[0] : u.id.slice(0,8)) })
    
    const sessionMap = {}
    sessions.forEach(s => sessionMap[s.id] = s)
    
    let memberMsgs=0, guestMsgs=0, memberUserMsgs=0, guestUserMsgs=0
    msgs.forEach(m => {
        const s = sessionMap[m.session_id]
        if (s && s.user_id) { memberMsgs++; if(m.role==='user') memberUserMsgs++ }
        else { guestMsgs++; if(m.role==='user') guestUserMsgs++ }
    })
    
    let memberSessions=0, guestSessions=0, memberActive=0, guestActive=0
    sessions.forEach(s => {
        if (s.user_id) { memberSessions++; if((s.message_count||0)>0) memberActive++ }
        else { guestSessions++; if((s.message_count||0)>0) guestActive++ }
    })
    
    const userStats = {}
    sessions.filter(s=>s.user_id).forEach(s => {
        if (!userStats[s.user_id]) userStats[s.user_id] = {sessions:0, msgs:0, mentors:new Set()}
        userStats[s.user_id].sessions++
        userStats[s.user_id].msgs += (s.message_count||0)
        userStats[s.user_id].mentors.add(mMap[s.mentor_id]||'?')
    })
    
    console.log('=== 회원 vs 비회원 ===\n')
    console.log('[ 세션 ]')
    console.log('  회원 세션: ' + memberSessions + ' (대화한 세션: ' + memberActive + ')')
    console.log('  비회원 세션: ' + guestSessions + ' (대화한 세션: ' + guestActive + ')')
    console.log('')
    console.log('[ 메시지 ]')
    console.log('  회원 총 메시지: ' + memberMsgs + ' (유저 발화: ' + memberUserMsgs + ')')
    console.log('  비회원 총 메시지: ' + guestMsgs + ' (유저 발화: ' + guestUserMsgs + ')')
    console.log('')
    console.log('[ 회원별 대화량 (메시지 많은 순) ]')
    Object.entries(userStats)
        .sort((a,b) => b[1].msgs - a[1].msgs)
        .forEach(([uid, st]) => {
            const mentorList = [...st.mentors].join(', ')
            console.log('  ' + uMap[uid] + ': ' + st.msgs + '개 메시지, ' + st.sessions + '개 세션 | ' + mentorList)
        })
})()
