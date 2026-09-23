// GET    /api/os/team/link?mentorId= → 이 봇이 내 팀에 있나 + 연동 수
// POST   /api/os/team/link { mentorId } → 마켓 봇을 내 팀에 넣기(연동). 봇 주인에게 알림(하루 1회)
// DELETE /api/os/team/link { mentorId } → 팀에서 빼기(연동 해제)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { getLinkCount, isInMyTeam, linkMarketBot, unlinkMarketBot, LinkTableMissing } from '@/domains/os/team-link'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

async function mentorIdFrom(req: Request): Promise<string | null> {
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const id = typeof b.mentorId === 'string' ? b.mentorId.trim() : ''
    return UUID.test(id) ? id : null
}

export async function GET(req: Request) {
    const mentorId = new URL(req.url).searchParams.get('mentorId') ?? ''
    if (!UUID.test(mentorId)) return NextResponse.json({ error: '봇을 찾을 수 없어요' }, { status: 400 })
    const user = await me()
    const db = createAdminClient()
    const linkCount = await getLinkCount(db, mentorId)
    if (!user) return NextResponse.json({ guest: true, inTeam: false, linkedFromMarket: false, linkCount })
    try {
        const mine = await isInMyTeam(db, user.id, mentorId)
        return NextResponse.json({ guest: false, inTeam: mine.inTeam, linkedFromMarket: mine.linkedFromMarket, linkCount })
    } catch (e) {
        console.error('[os/team/link GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ guest: false, inTeam: false, linkedFromMarket: false, linkCount })
    }
}

export async function POST(req: Request) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const mentorId = await mentorIdFrom(req)
    if (!mentorId) return NextResponse.json({ error: '봇을 찾을 수 없어요' }, { status: 400 })

    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('botlink', user.id), 20, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('팀에 넣기') }, { status: 429 })

    const displayName = (user.user_metadata?.full_name as string | undefined) || user.email?.split('@')[0] || '누군가'
    try {
        const out = await linkMarketBot(db, { id: user.id, displayName }, mentorId)
        if (out.status === 'not_found') return NextResponse.json({ error: '공개된 봇이 아니에요' }, { status: 404 })
        if (out.status === 'own') return NextResponse.json({ ...out, message: '내가 만든 봇이라 그대로 팀에 넣었어요. 이 봇과는 무료로 대화할 수 있어요.' })
        if (out.status === 'already') return NextResponse.json({ ...out, message: '이미 내 팀에 있는 봇이에요.' })
        return NextResponse.json({ ...out, message: '내 팀에 넣었어요. 봇 화면 격자에서 바로 대화할 수 있어요.' })
    } catch (e) {
        if (e instanceof LinkTableMissing) return NextResponse.json({ error: '연동 표가 아직 준비되지 않았어요(관리자에게 알려 주세요)', tableMissing: true }, { status: 503 })
        console.error('[os/team/link POST]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '팀에 넣지 못했어요' }, { status: 500 })
    }
}

export async function DELETE(req: Request) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const mentorId = await mentorIdFrom(req)
    if (!mentorId) return NextResponse.json({ error: '봇을 찾을 수 없어요' }, { status: 400 })
    try {
        const out = await unlinkMarketBot(createAdminClient(), user.id, mentorId)
        return NextResponse.json({ ...out, message: out.removed ? '팀에서 뺐어요.' : '팀에 없는 봇이에요.' })
    } catch (e) {
        console.error('[os/team/link DELETE]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '빼지 못했어요' }, { status: 500 })
    }
}
