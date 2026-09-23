// POST /api/os/channels/[id]/chat — 그룹방에 사람이 말하면 봇이 답한다.
//
// 돌아가는 순서 (한 번에 끝. 스트림 아님)
//   ① 사람 말 저장
//   ② 사람이 「@홍보팀장 …」 처럼 한 명을 콕 집으면 **그 봇만** 답하고 끝난다
//   ③ 아니면 「첫 답 봇」 하나가 답한다 (방에 처음 넣은 봇 = 기본 비서실장 자리)
//   ④ 그 답에 「@다른봇」이 있으면 그 봇이 **딱 한 번** 이어 답한다
//   ⑤ 거기서 끝. 두 번째 봇이 또 누구를 불러도 아무도 답하지 않는다 (그록봇 안티패턴 ㉟)
//
// 🔒 남의 방은 getChannel 이 null 을 돌려줘서 여기서 끝난다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    getChannel, getChannelBots, listChannelMessages, saveChannelMessage,
    findMentionedBot, canBotSpeakAgain, ChannelTableMissing,
} from '@/domains/os/channels'
import type { ChannelBot, ChannelMessage } from '@/domains/os/channels'
import { askSolar } from '@/domains/agent/ask'
import { SOLAR_CHAT_MODEL } from '@/domains/llm/constants'
import { UNAVAILABLE_TEXT } from '@/domains/chat/constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 최근 말 몇 줄을 봇에게 보여 줄까 */
const CONTEXT_LINES = 12

function 대화기록(messages: ChannelMessage[], bots: ChannelBot[]): string {
    const name = new Map(bots.map(b => [b.mentorId, b.name]))
    return messages.slice(-CONTEXT_LINES)
        .map(m => m.authorKind === 'user' ? `주인: ${m.content}` : `${name.get(m.mentorId ?? '') ?? '봇'}: ${m.content}`)
        .join('\n')
}

function 방규칙(me: ChannelBot, others: ChannelBot[]): string {
    const 이름들 = others.map(b => `@${b.name}`).join(' ') || '(없음)'
    return `${me.systemPrompt || `너는 「${me.name}」. 주인의 AI 팀원이다.`}

[지금은 그룹 채팅방이다]
- 같은 방에 있는 다른 봇: ${이름들}
- 짧게 답한다(3~5문장). 앞사람이 한 말을 되풀이하지 않는다.
- 네 몫이 아닌 일이면 다른 봇을 **한 명만** @이름 으로 부른다. 두 명 이상 부르지 않는다.
- 부를 사람이 없으면 아무도 부르지 않는다. 바뀐 게 없으면 길게 말하지 않는다.
- 밖으로 나가는 일(보내기·게시·구매·이체·삭제)은 여기서 하지 않는다. 필요하면 초안만 쓰고 주인에게 물어본다.`
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const text = String(body.text ?? '').trim()
    if (!text) return NextResponse.json({ error: '할 말을 적어 주세요' }, { status: 400 })

    try {
        const db = createAdminClient()
        const channel = await getChannel(db, user.id, id)
        if (!channel) return NextResponse.json({ error: '그 방을 못 찾았어요' }, { status: 404 })

        const bots = await getChannelBots(db, user.id, channel.memberMentorIds)
        if (bots.length === 0) return NextResponse.json({ error: '이 방에 말할 봇이 없어요' }, { status: 400 })

        const 지난말 = await listChannelMessages(db, user.id, id)
        const 사람말 = await saveChannelMessage(db, id, { authorKind: 'user', content: text })

        const 새말: ChannelMessage[] = [사람말]
        let 봇이말한횟수 = 0

        // 사람이 「@이름」으로 한 명을 콕 집었나. 집었으면 그 봇만 답하고 다른 봇은 안 끼어든다.
        const 콕집음 = findMentionedBot(text, bots.map(b => ({ mentorId: b.mentorId, name: b.name })))
        let 말할봇: ChannelBot | null = 콕집음
            ? bots.find(b => b.mentorId === 콕집음.mentorId) ?? bots[0]
            : bots[0]                                    // 첫 답 봇 = 방에 처음 넣은 봇
        let 앞선봇: string | null = null

        while (말할봇 && canBotSpeakAgain(봇이말한횟수)) {
            const 나머지 = bots.filter(b => b.mentorId !== 말할봇!.mentorId)
            const 기록 = 대화기록([...지난말, ...새말], bots)
            const 답 = await askSolar(
                방규칙(말할봇, 나머지),
                `[방에서 오간 말]\n${기록}\n\n위 흐름에 이어 「${말할봇.name}」으로서 답한다.`,
                { model: SOLAR_CHAT_MODEL, temperature: 0.7, maxTokens: 900 },
            )
            const 내용 = (답 ?? UNAVAILABLE_TEXT).trim()
            const 저장 = await saveChannelMessage(db, id, { authorKind: 'bot', mentorId: 말할봇.mentorId, content: 내용 })
            새말.push(저장)
            봇이말한횟수 += 1
            앞선봇 = 말할봇.mentorId

            // 답 속에 「@다른봇」이 있으면 그 봇이 한 번만 이어 답한다.
            // 단 사람이 한 명을 콕 집은 경우엔 그 봇 하나로 끝낸다(부른 사람만 답한다).
            const 지목: { mentorId: string; name: string } | null = (답 && !콕집음)
                ? findMentionedBot(내용, bots.map(b => ({ mentorId: b.mentorId, name: b.name })), 앞선봇)
                : null
            말할봇 = (지목 && canBotSpeakAgain(봇이말한횟수))
                ? bots.find(b => b.mentorId === 지목.mentorId) ?? null
                : null
        }

        return NextResponse.json({ messages: 새말, members: bots })
    } catch (e) {
        if (e instanceof ChannelTableMissing) return NextResponse.json({ tableMissing: true }, { status: 503 })
        const message = e instanceof Error ? e.message : '말을 못 옮겼어요'
        console.error('[os/channels chat]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
