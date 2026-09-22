// GET  /api/os/routines?mentorId=… → 내 루틴 목록
// POST /api/os/routines             → 새 루틴 (켜기 전 6확인). 항상 꺼진 채로 태어난다
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listRoutines, createRoutine, RoutineTableMissing } from '@/domains/os/routines'
import { parseLocalTime } from '@/domains/os/schedule'
import type { NewRoutineInput } from '@/domains/os/routines'

export const dynamic = 'force-dynamic'

const KINDS = new Set(['daily', 'weekdays', 'weekly'])
const MISSING = new Set(['report_failure', 'skip'])

export async function GET(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ routines: [], guest: true })

    const mentorId = new URL(req.url).searchParams.get('mentorId') || undefined
    try {
        const routines = await listRoutines(createAdminClient(), user.id, mentorId)
        return NextResponse.json({ routines })
    } catch (e) {
        // 표가 아직 없으면 화면은 「준비 중」으로 조용히 산다. 죽이지 않는다.
        if (e instanceof RoutineTableMissing) return NextResponse.json({ routines: [], tableMissing: true })
        console.error('[os/routines GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '루틴을 불러오지 못했어요' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(b.mentorId ?? '')
    const title = String(b.title ?? '').trim()
    const instruction = String(b.instruction ?? '').trim()
    const scheduleKind = String(b.scheduleKind ?? 'daily')
    const runAtLocal = String(b.runAtLocal ?? '')
    const weekdayRaw = b.weekday

    if (!mentorId) return NextResponse.json({ error: '어느 봇이 맡을지 골라 주세요' }, { status: 400 })
    if (!title || title.length > 40) return NextResponse.json({ error: '루틴 이름은 1~40자' }, { status: 400 })
    if (!instruction || instruction.length > 1000) return NextResponse.json({ error: '시킬 일을 1~1000자로 써 주세요' }, { status: 400 })
    if (!KINDS.has(scheduleKind)) return NextResponse.json({ error: '언제 돌지 골라 주세요' }, { status: 400 })
    if (parseLocalTime(runAtLocal) === null) return NextResponse.json({ error: '시각을 골라 주세요' }, { status: 400 })

    let weekday: number | null = null
    if (scheduleKind === 'weekly') {
        const n = Number(weekdayRaw)
        if (!Number.isInteger(n) || n < 0 || n > 6) return NextResponse.json({ error: '무슨 요일에 돌지 골라 주세요' }, { status: 400 })
        weekday = n
    }

    const input: NewRoutineInput = {
        mentorId, title, instruction,
        scheduleKind: scheduleKind as NewRoutineInput['scheduleKind'],
        runAtLocal, weekday,
        inputSource: String(b.inputSource ?? '').slice(0, 300),
        expectedOutput: String(b.expectedOutput ?? '').slice(0, 300),
        onMissingData: MISSING.has(String(b.onMissingData)) ? String(b.onMissingData) as 'report_failure' | 'skip' : 'report_failure',
        approvalBoundary: String(b.approvalBoundary ?? '').slice(0, 200),
    }

    try {
        const routine = await createRoutine(createAdminClient(), user.id, input)
        return NextResponse.json({ routine })
    } catch (e) {
        if (e instanceof RoutineTableMissing) {
            return NextResponse.json({ error: '루틴 표가 아직 준비되지 않았어요(관리자에게 알려 주세요)', tableMissing: true }, { status: 503 })
        }
        console.error('[os/routines POST]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: e instanceof Error ? e.message : '루틴을 만들지 못했어요' }, { status: 500 })
    }
}
