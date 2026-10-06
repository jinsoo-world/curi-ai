// GET /api/os/team/[id]/sns → 봇 「내 SNS 연결」 칸 4개(주소, 상태, 마지막 배운 시각, 배운 글 수) + 요금제 상한
// PUT /api/os/team/[id]/sns → 주소 저장 { instagram?, blog?, youtube?, curious? } (보낸 칸만 바꾼다. null, "" = 지우기)
//
// [id] = 팀 칸 번호(team_bots.id). 봇 고치기(PATCH /api/os/team/[id])와 같은 번호.
// 🔒 봇 주인만 (내 팀 칸 + 내가 만든 봇, resolveOwnedBot). 앱은 Authorization: Bearer, 웹은 쿠키 (createClient 가 둘 다 받는다)
// 저장한 주소는 봇 소개 화면(/coach/봇)에 링크로 보인다(mentors.links). 배우기는 POST ./learn
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { BotNotMine } from '@/domains/os/knowledge'
import { FeedTableMissing } from '@/domains/os/feeds'
import { readBotSns, saveBotSns, resolveOwnedBot, readPlanId, isSnsSlot, SnsInputError, SnsNotReady, SNS_SLOTS, type SnsInput } from '@/domains/os/bot-sns'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** 주소 저장 = 분당 10번 (유튜브 @핸들은 공식 API 를 한 번 부른다) */
const SAVE_PER_MIN = 10
const 준비중 = 'SNS 연결은 준비 중이에요. 잠시 후 다시 해 주세요'

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

function 오류응답(e: unknown, where: string) {
    if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
    if (e instanceof SnsInputError) return NextResponse.json({ error: e.message, field: e.field }, { status: 400 })
    if (e instanceof FeedTableMissing || e instanceof SnsNotReady) return NextResponse.json({ error: 준비중, preparing: true }, { status: 503 })
    // 모르는 오류는 안쪽 글(DB 오류 등)을 내보내지 않고 일반 문구로 (보안 검토 PR #53)
    console.error(`[os/team/sns ${where}]`, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: where === 'GET' ? 'SNS 연결을 불러오지 못했어요' : 'SNS 주소를 저장하지 못했어요. 잠시 후 다시 해 주세요' }, { status: 500 })
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    try {
        const db = createAdminClient()
        const mentorId = await resolveOwnedBot(db, user.id, id)
        const plan = await readPlanId(db, user.id)
        return NextResponse.json(await readBotSns(db, mentorId, plan))
    } catch (e) {
        return 오류응답(e, 'GET')
    }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: '보낸 값이 이상해요' }, { status: 400 })

    const input: SnsInput = {}
    for (const [k, v] of Object.entries(body)) {
        if (!isSnsSlot(k)) continue
        if (v !== null && typeof v !== 'string') return NextResponse.json({ error: '주소는 글자로 보내 주세요', field: k }, { status: 400 })
        input[k] = v
    }
    if (Object.keys(input).length === 0) return NextResponse.json({ error: `바꿀 칸이 없어요 (${SNS_SLOTS.join(', ')})` }, { status: 400 })

    try {
        const db = createAdminClient()
        const mentorId = await resolveOwnedBot(db, user.id, id)
        const rl = await checkRateLimit(db, `sns-save:${user.id}`, SAVE_PER_MIN, 60)
        if (!rl.allowed) return NextResponse.json({ error: '조금 뒤에 다시 저장해 주세요', retryAfterSec: 60 }, { status: 429 })

        await saveBotSns(db, { userId: user.id, mentorId, input })
        revalidatePath(`/coach/${mentorId}`)
        const plan = await readPlanId(db, user.id)
        return NextResponse.json({ ok: true, ...(await readBotSns(db, mentorId, plan)) })
    } catch (e) {
        return 오류응답(e, 'PUT')
    }
}
