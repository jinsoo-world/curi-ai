// PATCH  /api/os/routines/[id] → 켜기·끄기, 칸 고치기
// DELETE /api/os/routines/[id] → 루틴 지우기
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateRoutine, deleteRoutine, RoutineTableMissing } from '@/domains/os/routines'
import { parseLocalTime } from '@/domains/os/schedule'

export const dynamic = 'force-dynamic'

const KINDS = ['daily', 'weekdays', 'weekly']
const MISSING = ['report_failure', 'skip']

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    const b = await req.json().catch(() => ({})) as Record<string, unknown>

    const patch: Record<string, unknown> = {}
    if (typeof b.enabled === 'boolean') patch.enabled = b.enabled
    if (typeof b.title === 'string' && b.title.trim()) patch.title = b.title.trim().slice(0, 40)
    if (typeof b.instruction === 'string' && b.instruction.trim()) patch.instruction = b.instruction.trim().slice(0, 1000)
    if (KINDS.includes(String(b.scheduleKind))) patch.scheduleKind = b.scheduleKind
    if (typeof b.runAtLocal === 'string' && parseLocalTime(b.runAtLocal) !== null) patch.runAtLocal = b.runAtLocal
    if (b.weekday === null || (Number.isInteger(Number(b.weekday)) && Number(b.weekday) >= 0 && Number(b.weekday) <= 6)) {
        if (b.weekday !== undefined) patch.weekday = b.weekday === null ? null : Number(b.weekday)
    }
    if (typeof b.inputSource === 'string') patch.inputSource = b.inputSource.slice(0, 300)
    if (typeof b.expectedOutput === 'string') patch.expectedOutput = b.expectedOutput.slice(0, 300)
    if (MISSING.includes(String(b.onMissingData))) patch.onMissingData = b.onMissingData
    if (typeof b.approvalBoundary === 'string') patch.approvalBoundary = b.approvalBoundary.slice(0, 200)

    try {
        await updateRoutine(createAdminClient(), user.id, id, patch)
        return NextResponse.json({ ok: true })
    } catch (e) {
        if (e instanceof RoutineTableMissing) return NextResponse.json({ error: '루틴 표가 아직 준비되지 않았어요', tableMissing: true }, { status: 503 })
        console.error('[os/routines PATCH]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '바꾸지 못했어요' }, { status: 500 })
    }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    try {
        await deleteRoutine(createAdminClient(), user.id, id)
        return NextResponse.json({ ok: true })
    } catch (e) {
        if (e instanceof RoutineTableMissing) return NextResponse.json({ error: '루틴 표가 아직 준비되지 않았어요', tableMissing: true }, { status: 503 })
        console.error('[os/routines DELETE]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '지우지 못했어요' }, { status: 500 })
    }
}
