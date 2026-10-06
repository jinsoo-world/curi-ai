// POST /api/os/channels/[id]/chat - 그룹방에 사람이 말하면 봇이 답한다.
//
// ① 사람 말 저장
// ② @콕집으면 그 봇(+@이어받기 1번)
// ③ 없으면 눈치 라우터가 말에 맞는 봇만 고른다(대개 1명, 상한 MAX_GROUP_REPLIES). 방장 없음.
//    뒤 차례 봇은 앞 답을 보고 덧붙일 게 없으면 [PASS] 로 빠진다.
// ④ 답은 askChat(솔라→Gemini 폴백). 둘 다 죽으면 UNAVAILABLE_TEXT.
// ⑤ 사람 말에 링크가 있으면(최대 3개) 1:1 대화와 같은 readers 로 읽어 답하는 봇들에게 넣는다(저장 안 함).
import { NextResponse } from 'next/server'
import { notifyNative, p025GroupReplied } from '@/domains/push'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readUsage } from '@/domains/os/usage-db'
import { limitReachedMessage } from '@/domains/os/usage'
import {
    getChannel, getChannelBots, toClientBot, listChannelMessages, saveChannelMessage,
    findMentionedBot, canBotSpeakAgain, ChannelTableMissing,
} from '@/domains/os/channels'
import type { ChannelBot, ChannelMessage } from '@/domains/os/channels'
import { askChat, askSolar } from '@/domains/agent/ask'
import type { UsageCtx } from '@/domains/llm/usage-log'
import { routeGroupReply, buildGroupSystemPrompt, isPassReply } from '@/domains/os/group-router'
import type { GroupReplyMode } from '@/domains/os/group-router'
import { UNAVAILABLE_TEXT } from '@/domains/chat/constants'
import { GROUP_SERVER_GAP_MS, sleep } from '@/domains/os/group-stagger'
import { readUrlsInText, buildLinkPrompt, linkTextForTurn } from '@/domains/os/readers'
import type { ReadUrlView } from '@/domains/os/readers'
import { listBlockedMentorIds, withoutBlocked } from '@/domains/os/blocks'
import { createChatDeadline, withinBudget } from '@/domains/chat/deadline'
import type { ChatDeadline } from '@/domains/chat/deadline'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CONTEXT_LINES = 12
/** 봇 하나가 답하려면 최소 이만큼은 남아 있어야 한다. 모자라면 남은 봇은 건너뛰고 「잠시 뒤 이어서」 (2026-10-06 멈춤 점검) */
const BOT_MIN_MS = 8_000
const CONTINUE_LATER_TEXT = '답할 시간이 모자라 남은 봇은 잠시 쉬었어요. 잠시 뒤 이어서 말을 걸어 주세요.'

function 대화기록(messages: ChannelMessage[], bots: ChannelBot[]): string {
    const name = new Map(bots.map(b => [b.mentorId, b.name]))
    return messages.slice(-CONTEXT_LINES)
        .map(m => m.authorKind === 'user' ? `주인: ${m.content}` : `${name.get(m.mentorId ?? '') ?? '봇'}: ${m.content}`)
        .join('\n')
}

/** 눈치 라우터 한 번 묻기: 솔라 미니, 짧은 타임아웃(6초, 대화 마감이 더 이르면 그 안에서). 안 되면 null → 폴백 한 명 */
async function 라우터묻기(system: string, user: string, 기록자리: UsageCtx | undefined, deadline: ChatDeadline): Promise<string | null> {
    const budget = deadline.sideBudget(6_000)
    if (budget <= 0) return null
    return askSolar(system, user, {
        temperature: 0, maxTokens: 16, signal: AbortSignal.timeout(budget),
        usage: 기록자리 ? { ...기록자리, route: '/api/os/channels/[id]/chat', kind: 'router' } : undefined,
    })
}

async function 봇한줄(
    말할봇: ChannelBot,
    bots: ChannelBot[],
    기록: string,
    mode: GroupReplyMode,
    링크글 = '',
    기록자리?: UsageCtx,
    deadline?: ChatDeadline,
): Promise<string | null> {
    const 나머지 = bots.filter(b => b.mentorId !== 말할봇.mentorId)
    const 시스템 = buildGroupSystemPrompt(말할봇, 나머지, mode)
    const 답 = await askChat(
        링크글 ? `${링크글}\n\n${시스템}` : 시스템,
        `[방에서 오간 말]\n${기록}\n\n위 흐름에 이어 「${말할봇.name}」으로서 답한다.`,
        {
            maxTokens: 900,
            // 봇별 답도 대화 마감(시작 + 55초)을 넘기지 않는다
            deadline: deadline?.at,
            usage: 기록자리 ? { ...기록자리, route: '/api/os/channels/[id]/chat', mentorId: 말할봇.mentorId, kind: 'group' } : undefined,
        },
    )
    return 답 ? 답.trim() : null
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    // ⏱ 마감 = 시작 + 55초 (domains/chat/deadline). 링크·라우터는 남은 시간 - 25초 안에서, 봇 답은 마감 안에서
    const deadline = createChatDeadline()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    // 로그인 회원 그룹 대화도 월간 사용 한도 (계정 단위, 클로버 게이트 없음)
    {
        const usage = await readUsage(createAdminClient(), user.id, new Date(), user.email)
        if (usage.blocked) {
            const msg = limitReachedMessage(usage.resetAt)
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

        // 내가 차단한 봇은 방에 있어도 답하지 않는다(@콕집어도, 눈치 라우터도)
        const bots = withoutBlocked(await getChannelBots(db, user.id, channel.memberMentorIds), await listBlockedMentorIds(db, user.id), b => b.mentorId)
        if (bots.length === 0) return NextResponse.json({ error: '이 방에 말할 봇이 없어요' }, { status: 400 })

        // 🔗 링크 읽기 (읽기만 하는 일이라 승인 카드 없음, 절대 던지지 않음)
        //    이번 말에 주소가 없으면 바로 앞 사람 말(최대 2개)의 주소를 다시 읽는다(이어 묻기)
        const 지난말 = await listChannelMessages(db, user.id, id)
        // 💾 사람 말은 먼저 저장한다 (링크 읽기·봇 답이 늦거나 끊겨도 내 말은 남는다)
        const 사람말 = await saveChannelMessage(db, id, { authorKind: 'user', content: text })
        const 링크차례 = linkTextForTurn([...지난말.filter(m => m.authorKind === 'user').slice(-2).map(m => m.content), text])
        const 읽은것 = 링크차례.text
            ? await withinBudget(() => readUrlsInText(링크차례.text, undefined, { gemini: { userId: user.id } }).catch(() => []), deadline.sideBudget(15_000), [] as Awaited<ReturnType<typeof readUrlsInText>>, 'group-links')
            : []
        const 링크 = 읽은것.length > 0 ? buildLinkPrompt(읽은것, { fromHistory: 링크차례.fromHistory }) : null
        const 링크글 = 링크?.prefix ?? ''
        const readUrls: ReadUrlView[] = 링크?.readUrls ?? []
        /** 마감이 가까워 남은 봇을 건너뛰었나 */
        let 이어서 = false
        const 시간있나 = () => deadline.remaining() >= BOT_MIN_MS

        const 새말: ChannelMessage[] = [사람말]
        const 기록자리: UsageCtx = { route: '/api/os/channels/[id]/chat', userId: user.id, channelId: id }
        const 멤버목록 = bots.map(b => ({ mentorId: b.mentorId, name: b.name }))
        const 콕집음 = findMentionedBot(text, 멤버목록)
        const 말한봇: string[] = []

        if (콕집음) {
            let 봇이말한횟수 = 0
            let 말할봇: ChannelBot | null = bots.find(b => b.mentorId === 콕집음.mentorId) ?? bots[0]
            let 앞선봇: string | null = null
            while (말할봇 && canBotSpeakAgain(봇이말한횟수)) {
                if (!시간있나()) { 이어서 = true; break }
                const 기록 = 대화기록([...지난말, ...새말], bots)
                const 내용: string = (await 봇한줄(말할봇, bots, 기록, 'mention', 링크글, 기록자리, deadline)) ?? UNAVAILABLE_TEXT
                const 저장 = await saveChannelMessage(db, id, { authorKind: 'bot', mentorId: 말할봇.mentorId, content: 내용 })
                새말.push(저장)
                말한봇.push(말할봇.mentorId)
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
            // 눈치 라우터: 말에 맞는 봇만. 실패하면 한 명(전원 아님)
            const 최근 = [...지난말, 사람말].slice(-CONTEXT_LINES).map(m => ({
                who: m.authorKind === 'user' ? '주인' : (bots.find(b => b.mentorId === m.mentorId)?.name ?? '봇'),
                text: m.content,
            }))
            const 고른id = await routeGroupReply(text, bots, 최근, (sys, u) => 라우터묻기(sys, u, 기록자리, deadline))
            const 고른봇 = 고른id
                .map(mid => bots.find(b => b.mentorId === mid))
                .filter((b): b is ChannelBot => !!b)
            for (let i = 0; i < 고른봇.length; i++) {
                const 말할봇 = 고른봇[i]!
                // 마감(55초)이 가까우면 남은 봇은 건너뛰고 「잠시 뒤 이어서」
                if (!시간있나()) { 이어서 = true; break }
                const 첫답 = 말한봇.length === 0
                const 기록 = 대화기록([...지난말, ...새말], bots)
                const 답 = await 봇한줄(말할봇, bots, 기록, 첫답 ? 'routed-first' : 'routed-next', 링크글, 기록자리, deadline)
                const 빈답 = 답 === null || isPassReply(답)
                // 덧붙일 게 없거나 모델이 죽었으면 조용히 빠진다. 아무도 말 못 했으면 마지막에 한 줄은 남긴다.
                if (빈답 && (!첫답 || i < 고른봇.length - 1)) continue
                const 내용 = 빈답 ? UNAVAILABLE_TEXT : 답!
                const 저장 = await saveChannelMessage(db, id, { authorKind: 'bot', mentorId: 말할봇.mentorId, content: 내용 })
                새말.push(저장)
                말한봇.push(말할봇.mentorId)
                if (i < 고른봇.length - 1 && 시간있나()) await sleep(GROUP_SERVER_GAP_MS)
            }
        }
        // 앱 알림 P025(단체방 답 도착) = 답을 기다리다 앱을 닫거나 방을 나가 연결이 끊긴 경우만.
        // 화면을 보고 있으면 답이 바로 보이므로 울리지 않는다. 방마다 10분에 1번.
        if (req.signal.aborted && 말한봇.length > 0) {
            const 이름 = 말한봇.map(mid => bots.find(b => b.mentorId === mid)?.name).filter((n): n is string => !!n)
            await notifyNative(db, p025GroupReplied({ userId: user.id, channelId: id, roomName: channel.name, botNames: [...new Set(이름)] }))
        }
        return NextResponse.json({
            messages: 새말,
            members: bots.map(toClientBot),   // 지시문은 응답에 안 싣는다
            responderIds: 말한봇,
            // 읽은 링크(성공, 실패). 화면이 첫 봇 답 아래에 작은 카드로 보여 준다
            readUrls,
            // 마감이 가까워 남은 봇을 건너뛰었으면 화면이 안내 한 줄을 띄운다
            ...(이어서 ? { continueLater: true, notice: CONTINUE_LATER_TEXT } : {}),
        })
    } catch (e) {
        if (e instanceof ChannelTableMissing) return NextResponse.json({ tableMissing: true }, { status: 503 })
        const message = e instanceof Error ? e.message : '말을 못 옮겼어요'
        console.error('[os/channels chat]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
