// POST /api/os/deep-create = 「깊게 만들기」 시작 (대표 확정 10/7, 구독 전용 · 무료는 미리보기만)
// body { idea(≤200자), links?: string[](≤3), refText?: string(≤20,000자) } → { jobId, status, stage, paywall }
// 서버가 조사 → 정리 → 점검을 단계별로 돈다(응답 뒤에도 계속). 앱은 GET /api/os/deep-create/{jobId} 로 상태를 묻는다.
// 한도: 사람별 시간당 5번(셀 수 없으면 막음) → 무료는 이번 달 AI 예산 90% 넘으면 미리보기 정지 → 하루(서울) 무료 1·베이직 3·프로 10.
// 이미 도는 내 작업이 있으면 새로 만들지 않고 그 작업을 돌려준다(resumed: true).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { readPlanId } from '@/domains/os/usage-db'
import { checkAiBudget } from '@/domains/chat/budget-gate'
import { keepAliveAfterResponse } from '@/domains/llm/usage-log'
import {
    DEEP_DAILY, DEEP_PER_HOUR, DEEP_STAGE_LABEL, DeepTableMissing, cleanDeepInput, countDeepToday, findRunningDeepJob, isTableMissing, runDeepJob,
} from '@/domains/os/deep-create'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SOON = '깊게 만들기를 준비하고 있어요. 곧 열려요'

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const clean = cleanDeepInput(await req.json().catch(() => ({})))
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 })

    const db = createAdminClient()
    const plan = await readPlanId(db, user.id)
    const paywall = plan === 'free'

    const running = await findRunningDeepJob(db, user.id)
    if (running) return NextResponse.json({ jobId: running.id, status: running.status, stage: DEEP_STAGE_LABEL[running.status], paywall, resumed: true })

    const hour = await checkRateLimit(db, `deep-create:h:${user.id}`, DEEP_PER_HOUR, 3600, { failClosed: true })
    if (!hour.allowed) return NextResponse.json({ error: '조금 천천히 해 주세요. 1시간 뒤 다시 할 수 있어요' }, { status: 429 })

    if (paywall) {
        const budget = await checkAiBudget(db, { guest: false, paid: false })
        if (!budget.allowed) return NextResponse.json({ error: '지금은 이용이 많아 무료 미리보기를 잠시 쉬고 있어요. 구독하면 바로 만들 수 있어요', paywall }, { status: 429 })
    }

    let used: number | null
    try {
        used = await countDeepToday(db, user.id)
    } catch (e) {
        if (e instanceof DeepTableMissing) return NextResponse.json({ error: SOON }, { status: 503 })
        throw e
    }
    if (used === null) return NextResponse.json({ error: '잠시 후 다시 해 주세요' }, { status: 503 })
    if (used >= DEEP_DAILY[plan]) {
        const error = paywall
            ? '무료 미리보기는 하루 1번이에요. 구독하면 하루 여러 번 깊게 만들 수 있어요'
            : `오늘 깊게 만들기(${DEEP_DAILY[plan]}번)를 다 썼어요. 내일 다시 해 주세요`
        return NextResponse.json({ error, paywall }, { status: 429 })
    }

    const { idea, links, refText } = clean.input
    const { data, error } = await db.from('deep_create_jobs')
        .insert({ user_id: user.id, plan, status: 'research', idea, ref_links: links, ref_text: refText || null })
        .select('id, status')
        .single()
    if (error || !data) {
        if (isTableMissing(error)) return NextResponse.json({ error: SOON }, { status: 503 })
        console.error('[os/deep-create] 작업 만들기 실패:', error?.message)
        return NextResponse.json({ error: '잠시 후 다시 해 주세요' }, { status: 500 })
    }
    const jobId = (data as { id: string }).id
    // 응답은 바로 주고, 단계는 뒤에서 돈다 (Next after). 끊기면 폴링이 이어서 돌린다
    keepAliveAfterResponse(runDeepJob(db, jobId))
    return NextResponse.json({ jobId, status: 'research', stage: DEEP_STAGE_LABEL.research, paywall })
}
