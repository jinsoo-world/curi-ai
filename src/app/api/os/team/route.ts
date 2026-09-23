// GET  /api/os/team  → 내 봇 팀 명단
// POST /api/os/team  → 새 봇 만들기 (3걸음 입력)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listTeam, createTeamBot, TeamTableMissing, SHAPES, COLORS, JOBS } from '@/domains/os'
import type { NewBotInput } from '@/domains/os'

export const dynamic = 'force-dynamic'

const AUTONOMY_OK = new Set(['always_ask', 'draft_only', 'auto_safe'])

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ team: [], guest: true })
    try {
        const team = await listTeam(createAdminClient(), user.id)
        return NextResponse.json({ team })
    } catch (e) {
        if (e instanceof TeamTableMissing) return NextResponse.json({ team: [], tableMissing: true })
        console.error('[os/team GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '명단을 불러오지 못했어요' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as Partial<NewBotInput>
    const name = (body.name ?? '').toString().trim()
    if (!name || name.length > 20) return NextResponse.json({ error: '이름은 1~20자' }, { status: 400 })
    if (!JOBS.some(j => j.id === body.job)) return NextResponse.json({ error: '맡을 일을 골라 주세요' }, { status: 400 })
    if (body.job === 'custom' && !(body.customJob ?? '').toString().trim()) return NextResponse.json({ error: '맡을 일을 한 줄 써 주세요' }, { status: 400 })
    if (!AUTONOMY_OK.has(body.autonomy as string)) return NextResponse.json({ error: '승인 모드 값이 올바르지 않아요' }, { status: 400 })
    if (!SHAPES.includes(body.shape as never) || !COLORS.includes(body.color as never)) return NextResponse.json({ error: '모양과 색을 골라 주세요' }, { status: 400 })

    const input: NewBotInput = {
        job: body.job!, customJob: (body.customJob ?? '').toString().slice(0, 120),
        autonomy: body.autonomy!, name, shape: body.shape!, color: body.color!,
    }
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || '주인'
    try {
        const bot = await createTeamBot(createAdminClient(), { id: user.id, displayName }, input)
        return NextResponse.json({ bot })
    } catch (e) {
        if (e instanceof TeamTableMissing) return NextResponse.json({ error: '봇 팀 표가 아직 준비되지 않았어요(관리자에게 알려 주세요)', tableMissing: true }, { status: 503 })
        console.error('[os/team POST]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '봇을 만들지 못했어요' }, { status: 500 })
    }
}
