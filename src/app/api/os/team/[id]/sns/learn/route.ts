// POST /api/os/team/[id]/sns/learn { slots?: ['blog' | 'youtube' | 'curious'] } → 「지금 배우기」
//
// 저장한 SNS 주소에서 공개 글을 읽어 봇 자료로 넣는다(이미 배운 글은 건너뛴다). slots 를 안 보내면 배울 수 있는 칸 전부.
// 인스타그램은 메타 공식 API 전까지 「곧 열려요」라 여기서 돌지 않는다.
// 하루 1번 자동(새 글만)은 /api/cron/feeds 가 같은 함수(syncSnsFeed)로 돈다.
// 🔒 봇 주인만. 돈(임베딩)이 드는 창구라 횟수 제한은 셀 수 없으면 막는다(failClosed): 봇마다 분당 2번·하루 10번, 회원마다 하루 30번
//    기존 「지금 가져오기」(/api/os/feeds/sync)도 SNS 줄이면 같은 열쇠(checkSnsLearnLimits)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BotNotMine } from '@/domains/os/knowledge'
import { FeedTableMissing } from '@/domains/os/feeds'
import { learnBotSns, readBotSns, resolveOwnedBot, readPlanId, isSnsSlot, checkSnsLearnLimits, type SnsSlot } from '@/domains/os/bot-sns'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 응답까지 60초 안에 */
const LEARN_BUDGET_MS = 50_000

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const started = Date.now()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as { slots?: unknown }
    let slots: SnsSlot[] | undefined
    if (body && body.slots !== undefined) {
        if (!Array.isArray(body.slots) || !body.slots.every(isSnsSlot)) return NextResponse.json({ error: '배울 칸을 확인해 주세요 (blog, youtube, curious)' }, { status: 400 })
        slots = body.slots
    }
    try {
        const db = createAdminClient({ longRunning: true })
        const mentorId = await resolveOwnedBot(db, user.id, id)
        const limited = await checkSnsLearnLimits(db, user.id, mentorId)
        if (limited) return NextResponse.json(limited, { status: 429 })

        const results = await learnBotSns(db, { mentorId, slots, deadline: started + LEARN_BUDGET_MS })
        const plan = await readPlanId(db, user.id)
        return NextResponse.json({ results, ...(await readBotSns(db, mentorId, plan)) })
    } catch (e) {
        if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
        if (e instanceof FeedTableMissing) return NextResponse.json({ error: 'SNS 연결은 준비 중이에요', preparing: true }, { status: 503 })
        // 모르는 오류는 일반 문구로 (안쪽 글을 내보내지 않는다)
        console.error('[os/team/sns/learn]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '배우지 못했어요. 잠시 후 다시 해 주세요' }, { status: 500 })
    }
}
