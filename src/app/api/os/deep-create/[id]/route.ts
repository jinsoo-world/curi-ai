// GET /api/os/deep-create/{id} = 깊게 만들기 상태 (앱이 몇 초마다 묻는다)
// → { id, status: research|write|check|done|failed, stage, paywall, result, fidelity, error, mentorId, saved }
// 무료(지금 요금제 기준)는 result 에 지시문 앞 600자(promptPreview)와 점수만. 구독자는 전문(promptText)·약점·출처까지.
// 도는 단계인데 아무도 안 잡고 있거나 잡은 지 오래면(함수가 끊김) 여기서 이어서 돌린다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readPlanId } from '@/domains/os/usage-db'
import { keepAliveAfterResponse } from '@/domains/llm/usage-log'
import { DeepTableMissing, deepJobView, loadDeepJob, needsKick, runDeepJob } from '@/domains/os/deep-create'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: '찾을 수 없어요' }, { status: 404 })

    const db = createAdminClient()
    let job
    try {
        job = await loadDeepJob(db, id, user.id)
    } catch (e) {
        if (e instanceof DeepTableMissing) return NextResponse.json({ error: '곧 열려요' }, { status: 503 })
        console.error('[os/deep-create GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '잠시 후 다시 해 주세요' }, { status: 503 })
    }
    if (!job) return NextResponse.json({ error: '찾을 수 없어요' }, { status: 404 })
    if (needsKick(job)) keepAliveAfterResponse(runDeepJob(db, job.id))
    const plan = await readPlanId(db, user.id)
    return NextResponse.json(deepJobView(job, plan))
}
