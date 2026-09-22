// GET   /api/os/next-steps?all=1 → 다음 한 걸음 목록 (기본은 안 끝낸 것만)
// POST  /api/os/next-steps       → 봇 답 아래 「＋ 다음 한 걸음으로」로 저장
// PATCH /api/os/next-steps       → 끝냈다/다시 열었다, 글·기한 고치기 ({ id, ... })
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listNextSteps, createNextStep, patchNextStep, NextStepTableMissing } from '@/domains/os/nextSteps'

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function GET(req: Request) {
    const user = await me()
    if (!user) return NextResponse.json({ steps: [], guest: true })
    const all = new URL(req.url).searchParams.get('all') === '1'
    try {
        const steps = await listNextSteps(createAdminClient(), user.id, !all)
        return NextResponse.json({ steps })
    } catch (e) {
        if (e instanceof NextStepTableMissing) return NextResponse.json({ steps: [], tableMissing: true })
        console.error('[os/next-steps GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '미룬 일을 불러오지 못했어요' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const text = String(b.text ?? '').trim()
    if (!text || text.length > 200) return NextResponse.json({ error: '한 걸음은 1~200자로 써 주세요' }, { status: 400 })
    const dueOn = typeof b.dueOn === 'string' && DATE.test(b.dueOn) ? b.dueOn : null
    const mentorId = typeof b.mentorId === 'string' && b.mentorId ? b.mentorId : null

    try {
        const step = await createNextStep(createAdminClient(), user.id, { text, dueOn, mentorId })
        return NextResponse.json({ step })
    } catch (e) {
        if (e instanceof NextStepTableMissing) return NextResponse.json({ error: '미룬 일 표가 아직 준비되지 않았어요', tableMissing: true }, { status: 503 })
        console.error('[os/next-steps POST]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '저장하지 못했어요' }, { status: 500 })
    }
}

export async function PATCH(req: Request) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const id = String(b.id ?? '')
    if (!id) return NextResponse.json({ error: '어느 걸음인지 알려 주세요' }, { status: 400 })

    const patch: { done?: boolean; text?: string; dueOn?: string | null } = {}
    if (typeof b.done === 'boolean') patch.done = b.done
    if (typeof b.text === 'string' && b.text.trim()) patch.text = b.text.trim().slice(0, 200)
    if (b.dueOn === null) patch.dueOn = null
    else if (typeof b.dueOn === 'string' && DATE.test(b.dueOn)) patch.dueOn = b.dueOn

    try {
        await patchNextStep(createAdminClient(), user.id, id, patch)
        return NextResponse.json({ ok: true })
    } catch (e) {
        if (e instanceof NextStepTableMissing) return NextResponse.json({ error: '미룬 일 표가 아직 준비되지 않았어요', tableMissing: true }, { status: 503 })
        console.error('[os/next-steps PATCH]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '바꾸지 못했어요' }, { status: 500 })
    }
}
