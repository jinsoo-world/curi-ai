// PATCH  /api/os/team/[id] → 고정, 숨김, 정렬, 승인 모드, 모양, 색, 한 줄 소개, 역할, 이름, 인사말 (봇 편집 시트)
// DELETE /api/os/team/[id] → 팀에서 빼기 (봇의 몸과 대화 기록은 남는다)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateTeamBot, removeTeamBot, SHAPES, COLORS } from '@/domains/os'
import type { TeamBotPatch } from '@/domains/os'

export const dynamic = 'force-dynamic'

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const patch: TeamBotPatch = {}
    if (typeof body.pinned === 'boolean') patch.pinned = body.pinned
    if (typeof body.hidden === 'boolean') patch.hidden = body.hidden
    if (typeof body.sortOrder === 'number') patch.sortOrder = body.sortOrder
    if (['always_ask', 'draft_only', 'auto_safe'].includes(body.approvalMode as string)) patch.approvalMode = body.approvalMode as TeamBotPatch['approvalMode']
    if (SHAPES.includes(body.shape as never)) patch.shape = body.shape as TeamBotPatch['shape']
    if (COLORS.includes(body.color as never)) patch.color = body.color as TeamBotPatch['color']
    if (typeof body.oneLiner === 'string') patch.oneLiner = body.oneLiner.slice(0, 40)
    if (body.role === 'chief' || body.role === 'helper') patch.role = body.role
    if (typeof body.name === 'string') {
        const name = body.name.trim()
        if (!name || name.length > 20) return NextResponse.json({ error: '이름은 1~20자' }, { status: 400 })
        patch.name = name
    }
    if (typeof body.greeting === 'string') patch.greeting = body.greeting.slice(0, 200)
    try {
        await updateTeamBot(createAdminClient(), user.id, id, patch)
        return NextResponse.json({ ok: true })
    } catch (e) {
        console.error('[os/team PATCH]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '바꾸지 못했어요' }, { status: 500 })
    }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    try {
        await removeTeamBot(createAdminClient(), user.id, id)
        return NextResponse.json({ ok: true })
    } catch (e) {
        console.error('[os/team DELETE]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '빼지 못했어요' }, { status: 500 })
    }
}
