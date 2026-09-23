// POST /api/os/channels/[id]/chat - 그룹방에 사람이 말하면 봇이 답한다.
//
// ① 사람 말 저장
// ② @콕집으면 그 봇(+@이어받기 1번)
// ③ 없으면 진행 봇 → 멤버 병렬 (MAX_FANOUT_BOTS)
// ④ 답은 askChat(솔라→Gemini 폴백). 둘 다 죽으면 UNAVAILABLE_TEXT.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readUsage } from '@/domains/os/usage-db'
import { kstDayHourText } from '@/domains/os/usage'
import {
    getChannel, getChannelBots, listChannelMessages, saveChannelMessage,
    findMentionedBot, canBotSpeakAgain, pickResponders, ChannelTableMissing,
} from '@/domains/os/channels'
import type { ChannelBot, ChannelMessage } from '@/domains/os/channels'
import { askChat } from '@/domains/agent/ask'
import { UNAVAILABLE_TEXT } from '@/domains/chat/constants'
import { GROUP_SERVER_GAP_MS, sleep } from '@/domains/os/group-stagger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CONTEXT_LINES = 12

function 대화기록(messages: ChannelMessage[], bots: ChannelBot[]): string {
    const name = new Map(bots.map(b => [b.mentorId, b.name]))
    return messages.slice(-CONTEXT_LINES)
        .map(m => m.authorKind === 'user' ? `주인: ${m.content}` : `${name.get(m.mentorId ?? '') ?? '봇'}: ${m.content}`)
        .join('\n')
}

function 방규칙(me: ChannelBot, others: ChannelBot[], mode: 'solo' | 'lead' | 'member'): string {
    const 이름들 = others.map(b => `@${b.name}`).join(' ') || '(없음)'
    const 공통 = `${me.systemPrompt || `너는 「${me.name}」. 주인의 AI 팀원이다.`}

[지금은 그룹 채팅방이다]
- 같은 방에 있는 다른 봇: ${이름들}
- 앞사람이 한 말을 되풀이하지 않는다.
- 밖으로 나가는 일(보내기, 게시, 구매, 이체, 삭제)은 여기서 하지 않는다. 필요하면 초안만 쓰고 주인에게 물어본다.`
    if (mode === 'lead') {
        return `${공통}
- 너는 이 방의 진행 봇이다. 주인 말에 한두 문장으로 짧게 받은 뒤, 누가 어떤 몫을 보면 좋은지만 짧게 나눠 준다.
- 본론은 다른 봇에게 맡긴다. @이름으로 다른 봇을 부르지 않는다(이미 차례로 답한다).`
    }
    if (mode === 'member') {
        return `${공통}
- 진행 봇이 짧게 받은 뒤이다. 당신 역할로 본론을 답한다(3~5문장).
- @이름으로 다른 봇을 부르지 않는다.`
    }
    return `${공통}
- 짧게 답한다(3~5문장).
- 네 몫이 아닌 일이면 다른 봇을 **한 명만** @이름 으로 부른다. 두 명 이상 부르지 않는다.
- 부를 사람이 없으면 아무도 부르지 않는다. 바뀐 게 없으면 길게 말하지 않는다.`
}

async function 봇한줄(
    말할봇: ChannelBot,
    bots: ChannelBot[],
    기록: string,
    mode: 'solo' | 'lead' | 'member',
): Promise<string> {
    const 나머지 = bots.filter(b => b.mentorId !== 말할봇.mentorId)
    const 답 = await askChat(
        방규칙(말할봇, 나머지, mode),
        `[방에서 오간 말]\n${기록}\n\n위 흐름에 이어 「${말할봇.name}」으로서 답한다.`,
        { maxTokens: mode === 'lead' ? 400 : 900 },
    )
    return (답 ?? UNAVAILABLE_TEXT).trim()
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    // 로그인 회원 그룹 대화도 주간 사용 한도 (계정 단위, 클로버 게이트 없음)
    {
        const usage = await readUsage(createAdminClient(), user.id, new Date(), user.email)
        if (usage.blocked) {
            const msg = `이번 주 사용 한도에 닿았어요. ${kstDayHourText(usage.weekResetAt)}에 다시 채워져요. 더 쓰려면 요금제를 올려 보세요.`
            return NextResponse.json({ error: msg, usageLimit: true }, { status: 429 })
        }
    }

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
        const 멤버목록 = bots.map(b => ({ mentorId: b.mentorId, name: b.name }))
        const 콕집음 = findMentionedBot(text, 멤버목록)
        const 응답순 = pickResponders(text, 멤버목록)
            .map(r => bots.find(b => b.mentorId === r.mentorId))
            .filter((b): b is ChannelBot => !!b)

        if (콕집음) {
            let 봇이말한횟수 = 0
            let 말할봇: ChannelBot | null = 응답순[0] ?? bots[0]
            let 앞선봇: string | null = null
            while (말할봇 && canBotSpeakAgain(봇이말한횟수)) {
                const 기록 = 대화기록([...지난말, ...새말], bots)
                const 내용 = await 봇한줄(말할봇, bots, 기록, 'solo')
                const 저장 = await saveChannelMessage(db, id, { authorKind: 'bot', mentorId: 말할봇.mentorId, content: 내용 })
                새말.push(저장)
                봇이말한횟수 += 1
                앞선봇 = 말할봇.mentorId
                const 지목: { mentorId: string; name: string } | null =
                    내용 !== UNAVAILABLE_TEXT
                        ? findMentionedBot(내용, 멤버목록, 앞선봇)
                        : null
                말할봇 = (지목 && canBotSpeakAgain(봇이말한횟수))
                    ? bots.find(b => b.mentorId === 지목.mentorId) ?? null
                    : null
            }
        } else {
            const [lead, ...members] = 응답순
            if (lead) {
                const 기록 = 대화기록([...지난말, ...새말], bots)
                const 내용 = await 봇한줄(lead, bots, 기록, 'lead')
                const 저장 = await saveChannelMessage(db, id, { authorKind: 'bot', mentorId: lead.mentorId, content: 내용 })
                새말.push(저장)
            }
            if (members.length > 0) {
                // 멤버는 한 명씩 이어서 답한다 (Promise.all 동시 덤프 금지). 짧은 간격으로 말풍선이 겹치지 않게.
                for (let i = 0; i < members.length; i++) {
                    const 말할봇 = members[i]!
                    const 기록 = 대화기록([...지난말, ...새말], bots)
                    const 내용 = await 봇한줄(말할봇, bots, 기록, 'member')
                    const 저장 = await saveChannelMessage(db, id, { authorKind: 'bot', mentorId: 말할봇.mentorId, content: 내용 })
                    새말.push(저장)
                    if (i < members.length - 1) await sleep(GROUP_SERVER_GAP_MS)
                }
            }
        }

        return NextResponse.json({
            messages: 새말,
            members: bots,
            responderIds: 응답순.map(b => b.mentorId),
        })
    } catch (e) {
        if (e instanceof ChannelTableMissing) return NextResponse.json({ tableMissing: true }, { status: 503 })
        const message = e instanceof Error ? e.message : '말을 못 옮겼어요'
        console.error('[os/channels chat]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
