// POST /api/os/relay — 지금 방의 봇이 **옆 봇에게 말을 옮기고 답을 갖고 온다**.
//
// 돌아가는 순서 (한 번 건너가고 한 번 돌아온다 = 2턴. 더 이상 안 돈다)
//   ① 규칙(domains/agent/relay)으로 「누구에게 무엇을」을 뽑는다. 모델을 안 부른다 = 클로버 안 씀
//   ② 둘 다 **내 팀 봇**인지 검사한다(남의 봇에게는 못 옮긴다)
//   ③ 대상 봇의 최근 대화방(없으면 새로 만든다)에 「[기획팀장이 전달] 원문」을 사람 말로 넣는다
//   ④ 대상 봇이 **한 번** 답한다 (그 봇의 system_prompt + 그 방 최근 20줄)
//   ⑤ 그 답을 원래 방에도 「【홍보팀장의 답】」 첫 줄을 달아 남긴다
//
// 승인 카드 = 밖으로 나가는 일이 아니라 **둘 다 내 봇**이고 밖으로 안 나가므로 카드가 필요 없다.
// 다만 옮기려는 말 자체가 「보내기·게시·구매·이체…」면 기존 승인 카드 경로로 보낸다(아래 ②-1).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readRelayIntent, withRelayPrefix, withRelayAnswerHeader, countRelayTurns, RELAY_MAX_TURNS, RELAY_TURN_LIMIT_TEXT } from '@/domains/agent/relay'
import { classifyByRules } from '@/domains/agent/intent'
import { askSolar } from '@/domains/agent/ask'
import { assertBotOwned } from '@/domains/os/knowledge'
import { SOLAR_CHAT_MODEL } from '@/domains/llm/constants'
import { UNAVAILABLE_TEXT } from '@/domains/chat/constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 대상 봇에게 보여 줄 그 방의 최근 말 수 */
const CONTEXT_MESSAGES = 20

interface TeamRow {
    mentor_id: string
    mentors: { name: string | null; system_prompt: string | null; avatar_url: string | null } | null
    shape: string
    color: string
}

/** 내 팀 봇 명단 (이름 찾기에 쓴다) */
async function myTeam(db: SupabaseClient, userId: string): Promise<TeamRow[]> {
    const { data, error } = await db
        .from('team_bots')
        .select('mentor_id, shape, color, mentors(name, system_prompt, avatar_url)')
        .eq('user_id', userId)
        .eq('hidden', false)
    if (error) return []
    return (data ?? []) as unknown as TeamRow[]
}

/** 그 봇과의 최근 대화방. 없으면 새로 만든다 */
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

/** 그 방 최근 말 (role/content 그대로) — 턴 수 세기·문맥 조립 둘 다에 쓴다 */
async function recentRows(db: SupabaseClient, sessionId: string): Promise<{ role: string; content: string }[]> {
    const { data } = await db
        .from('messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(CONTEXT_MESSAGES)
    return ((data ?? []) as { role: string; content: string }[]).reverse()
}

/** 그 방 최근 말 몇 줄 (오래된 것 → 새것 순, 사람이 읽는 문맥 글로) */
async function recentLines(db: SupabaseClient, sessionId: string): Promise<string> {
    const rows = await recentRows(db, sessionId)
    return rows.map(r => `${r.role === 'assistant' ? '나' : '주인'}: ${r.content}`).join('\n')
}

/** 말 한 줄 저장 + 방 시각 갱신 (실패해도 대화는 이어진다) */
async function saveLine(db: SupabaseClient, sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    const { error } = await db.from('messages').insert({ session_id: sessionId, role, content })
    if (error) console.error('[os/relay] 말 저장 실패:', error.message)
    await db.from('chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', sessionId)
}

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const text = String(body.text ?? '').trim()
    const fromMentorId = String(body.fromMentorId ?? '')
    const fromSessionId = body.fromSessionId ? String(body.fromSessionId) : null
    if (!text || !fromMentorId) return NextResponse.json({ relayed: false })

    try {
        const db = createAdminClient()

        // ② 지금 방의 봇이 내 봇인가
        await assertBotOwned(db, user.id, fromMentorId)

        const team = await myTeam(db, user.id)
        const from = team.find(b => b.mentor_id === fromMentorId)
        const fromName = from?.mentors?.name ?? '옆 봇'

        // ① 누구에게 무엇을 (규칙만. 모델 안 부름)
        const intent = readRelayIntent(
            text,
            team.map(b => ({ mentorId: b.mentor_id, name: b.mentors?.name ?? '' })),
            fromMentorId,
        )
        if (!intent) return NextResponse.json({ relayed: false })

        const to = team.find(b => b.mentor_id === intent.mentorId)
        if (!to) return NextResponse.json({ relayed: false })
        const toName = to.mentors?.name ?? intent.name

        // ②-0 턴 상한 — 원래 방에 옆 봇 답이 이미 RELAY_MAX_TURNS번 쌓였으면 더 건너가지 않는다(무한 왕복 방지)
        if (fromSessionId) {
            const 지난말 = await recentRows(db, fromSessionId)
            if (countRelayTurns(지난말) >= RELAY_MAX_TURNS) {
                await saveLine(db, fromSessionId, 'user', text)
                await saveLine(db, fromSessionId, 'assistant', RELAY_TURN_LIMIT_TEXT)
                return NextResponse.json({
                    relayed: true,
                    capped: true,
                    from: { mentorId: fromMentorId, name: fromName },
                    to: {
                        mentorId: intent.mentorId, name: toName,
                        shape: to.shape, color: to.color, avatarUrl: to.mentors?.avatar_url ?? null,
                    },
                    sent: intent.message,
                    answer: RELAY_TURN_LIMIT_TEXT,
                })
            }
        }

        // ②-1 옮기려는 말 자체가 밖으로 나가는 일이면 여기서 옮기지 않는다 → 기존 승인 카드 경로
        const 의도 = classifyByRules(intent.message)
        if (의도.action !== 'none' && 의도.confident) {
            return NextResponse.json({
                relayed: false,
                needsApproval: true,
                reason: 의도.reason,
            })
        }

        // ③ 대상 봇의 방에 「사용자 대신 보낸 말」을 넣는다
        const toSession = await ensureSession(db, user.id, intent.mentorId, toName)
        if (!toSession) return NextResponse.json({ error: '옆 봇의 대화방을 열지 못했어요' }, { status: 500 })

        const 옮긴말 = withRelayPrefix(fromName, intent.message)
        const 기록 = await recentLines(db, toSession)
        await saveLine(db, toSession, 'user', 옮긴말)

        // ④ 대상 봇이 한 번만 답한다
        const 규칙 = `${to.mentors?.system_prompt || `너는 「${toName}」. 주인의 AI 팀원이다.`}

[지금은 옆 봇이 옮겨 온 말이다]
- 「${fromName}」이 주인의 말을 대신 옮겼다. 주인이 직접 물은 것처럼 답한다.
- 짧게 답한다(3~5문장). 되묻기보다 지금 아는 것으로 한 걸음 답한다.
- 밖으로 나가는 일(보내기·게시·구매·이체·삭제)은 여기서 하지 않는다. 필요하면 초안만 쓰고 주인에게 물어본다.
- 다른 봇을 다시 부르지 않는다. 여기서 이야기가 끝난다.`

        const 답 = await askSolar(
            규칙,
            `${기록 ? `[이 방에서 오간 말]\n${기록}\n\n` : ''}[${fromName}이 옮겨 온 말]\n${intent.message}\n\n위 말에 「${toName}」으로서 답한다.`,
            { model: SOLAR_CHAT_MODEL, temperature: 0.7, maxTokens: 900 },
        )
        const 답본문 = (답 ?? UNAVAILABLE_TEXT).trim()
        await saveLine(db, toSession, 'assistant', 답본문)

        // ⑤ 원래 방에도 남긴다 (첫 줄에 「【홍보팀장의 답】」 표식)
        const 원래방답 = withRelayAnswerHeader(toName, 답본문)
        if (fromSessionId) {
            await saveLine(db, fromSessionId, 'user', text)
            await saveLine(db, fromSessionId, 'assistant', 원래방답)
        }

        return NextResponse.json({
            relayed: true,
            from: { mentorId: fromMentorId, name: fromName },
            to: {
                mentorId: intent.mentorId, name: toName,
                shape: to.shape, color: to.color, avatarUrl: to.mentors?.avatar_url ?? null,
            },
            sent: intent.message,
            answer: 원래방답,
        })
    } catch (e) {
        const message = e instanceof Error ? e.message : '말을 못 옮겼어요'
        console.error('[os/relay]', message)
        // 내 봇이 아니거나 표가 아직 없으면 그냥 평소대로 대화한다
        return NextResponse.json({ relayed: false })
    }
}
