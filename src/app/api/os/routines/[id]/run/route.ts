// POST /api/os/routines/[id]/run → 「시험 실행」. 지금 한 번 돌려 결과를 대화방에 봇 답으로 남긴다.
//
// 왜 필요한가 = 켜기 전에 사람이 눈으로 한 번 봐야 한다(기획 §11 「자동화 전 7단계」).
// 크론과 **같은 함수**를 쓴다 — 시험에서 본 것과 아침에 도는 것이 다르면 사람이 속는다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRoutine, runRoutineOnce, RoutineTableMissing } from '@/domains/os/routines'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params

    try {
        const db = createAdminClient()
        const routine = await getRoutine(db, user.id, id)
        if (!routine) return NextResponse.json({ error: '없는 루틴이에요' }, { status: 404 })
        const r = await runRoutineOnce(db, routine)
        return NextResponse.json({ ok: r.ok, result: r.result, text: r.text })
    } catch (e) {
        if (e instanceof RoutineTableMissing) return NextResponse.json({ error: '루틴 표가 아직 준비되지 않았어요', tableMissing: true }, { status: 503 })
        console.error('[os/routines run]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '돌려 보지 못했어요' }, { status: 500 })
    }
}
