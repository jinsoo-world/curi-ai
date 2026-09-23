// POST /api/os/mention-handoff — 1:1 방에서 @다른봇 호출 시 **채널을 바꾸지 않고** 상대 봇 방에 말을 넣는다.
//
// 순서:
//   ① 둘 다 내 팀 봇인지 검사
//   ② 지금 방(from)에 사용자 원문 + 넘김 안내(ack)를 남긴다
//   ③ 상대 방(to)에 「[○○이 전달] …」 표식으로 말을 넣는다 (없으면 방 생성)
//   ④ 답을 지금 방으로 가져오지는 않는다 (사이드바가 상대 봇을 부르게 두고, 열면 그 방에서 이어간다)
//
// 그룹방 다봇 @멘션은 여기로 안 온다 (OsGroupChat / pickResponders).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withRelayPrefix } from '@/domains/agent/relay'
import { handoffAckLine } from '@/domains/os/mentions'
import { assertBotOwned } from '@/domains/os/knowledge'

export const dynamic = 'force-dynamic'

interface TeamRow {
    mentor_id: string
    mentors: { name: string | null } | null
}

async function myTeam(db: SupabaseClient, userId: string): Promise<TeamRow[]> {
    const { data, error } = await db
        .from('team_bots')
        .select('mentor_id, mentors(name)')
        .eq('user_id', userId)
        .eq('hidden', false)
    if (error) return []
    return (data ?? []) as unknown as TeamRow[]
}

async function ensureSession(db: SupabaseClient, userId: string, mentorId: string, botName: string): Promise<string | null> {
    const { data } = await db
        .from('chat_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('mentor_id', mentorId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
    const found = (data as { id: string } | null)?.id
    if (found) return found

    const { data: made, error } = await db
        .from('chat_sessions')
        .insert({ user_id: userId, mentor_id: mentorId, title: `${botName}와의 대화`, message_count: 0 })
        .select('id')
        .single()
    if (error || !made) return null
    return (made as { id: string }).id
}

async function saveLine(db: SupabaseClient, sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    const { error } = await db.from('messages').insert({ session_id: sessionId, role, content })
    if (error) console.error('[os/mention-handoff] 말 저장 실패:', error.message)
    await db.from('chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', sessionId)
}

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const text = String(body.text ?? '').trim().slice(0, 8000)
    const fromMentorId = String(body.fromMentorId ?? '')
    const toMentorId = String(body.toMentorId ?? '')
    const fromSessionId = body.fromSessionId ? String(body.fromSessionId) : null
    const message = String(body.message ?? '').trim().slice(0, 8000)
    if (!text || !fromMentorId || !toMentorId) {
        return NextResponse.json({ handedOff: false, error: '필요한 값이 없어요' }, { status: 400 })
    }
    if (fromMentorId === toMentorId) {
        return NextResponse.json({ handedOff: false, error: '같은 봇에게는 넘기지 않아요' }, { status: 400 })
    }

    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, fromMentorId)
        await assertBotOwned(db, user.id, toMentorId)

        const team = await myTeam(db, user.id)
        const from = team.find(b => b.mentor_id === fromMentorId)
        const to = team.find(b => b.mentor_id === toMentorId)
        if (!from || !to) return NextResponse.json({ handedOff: false, error: '팀 봇이 아니에요' }, { status: 403 })

        const fromName = from.mentors?.name ?? '옆 봇'
        const toName = to.mentors?.name ?? '옆 봇'
        const ack = handoffAckLine(toName)

        // ② 지금 방
        let sid = fromSessionId
        if (!sid) sid = await ensureSession(db, user.id, fromMentorId, fromName)
        if (sid) {
            await saveLine(db, sid, 'user', text)
            await saveLine(db, sid, 'assistant', ack)
        }

        // ③ 상대 방 — 내용이 없으면 「불러 주셨어요」만 남긴다
        const toSession = await ensureSession(db, user.id, toMentorId, toName)
        if (!toSession) {
            return NextResponse.json({ handedOff: false, error: '상대 봇 방을 열지 못했어요' }, { status: 500 })
        }
        const payload = message
            ? withRelayPrefix(fromName, message)
            : withRelayPrefix(fromName, '불러 주셨어요. 이어서 이야기해 주세요.')
        await saveLine(db, toSession, 'user', payload)

        return NextResponse.json({
            handedOff: true,
            from: { mentorId: fromMentorId, name: fromName },
            to: { mentorId: toMentorId, name: toName },
            ack,
            fromSessionId: sid,
        })
    } catch (e) {
        const message = e instanceof Error ? e.message : '넘기지 못했어요'
        console.error('[os/mention-handoff]', message)
        return NextResponse.json({ handedOff: false, error: message }, { status: 500 })
    }
}
