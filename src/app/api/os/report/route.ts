// POST /api/os/report { mentorId, reason, detail?, messageExcerpt?, messageId?, visitorId? } → 봇 신고 (애플 심사 지침 1.2)
// 로그인 회원(쿠키 또는 앱 Bearer)도, 손님(visitorId, 대화와 같은 값)도 된다. 회원이면 visitorId 는 무시한다.
// 없는 봇이어도 똑같이 200 = 있는지 없는지 새지 않는다(저장은 안 함).
// 자동 내림(회원 3명 + 주소 3개, 7일)은 domains/os/reports. 내렸으면 마켓, 홈 캐시를 비운다. 신고자에게는 알리지 않는다.
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { parseReportBody, cleanVisitorId, submitReport, hashIp, requestIp, ReportTableMissing } from '@/domains/os/reports'

export const dynamic = 'force-dynamic'

/** 한 사람 10분에 5건, 같은 인터넷 주소(손님) 하루 20건 */
const PER_REPORTER = { limit: 5, windowSec: 600 }
const PER_IP_GUEST = { limit: 20, windowSec: 86_400 }
const DONE = '신고했어요. 24시간 안에 확인할게요'

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const visitorId = user ? null : cleanVisitorId(body?.visitorId)
    if (!user && !visitorId) return NextResponse.json({ error: '다시 열고 신고해 주세요' }, { status: 400 })

    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('report', user?.id, visitorId, req), PER_REPORTER.limit, PER_REPORTER.windowSec)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('신고') }, { status: 429 })
    if (!user) {
        // 손님은 방문자 id 를 새로 만들어 여러 명인 척할 수 있다 = 인터넷 주소로 한 번 더 묶는다
        const ipRl = await checkRateLimit(db, rateLimitKey('report-ip', null, null, req), PER_IP_GUEST.limit, PER_IP_GUEST.windowSec)
        if (!ipRl.allowed) return NextResponse.json({ error: rateLimitMessage('신고') }, { status: 429 })
    }

    const parsed = parseReportBody(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    try {
        const r = await submitReport(db, {
            ...parsed.value, reporterUserId: user?.id ?? null, reporterVisitorId: visitorId, ipHash: hashIp(requestIp(req)),
        })
        if (r.autoUnpublished) { revalidatePath('/os/market'); revalidatePath('/home'); revalidatePath('/mentors') }
        return NextResponse.json({ ok: true, message: DONE })
    } catch (e) {
        if (e instanceof ReportTableMissing) return NextResponse.json({ error: '신고를 받을 준비가 아직 안 됐어요' }, { status: 503 })
        console.error('[os/report POST]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '신고를 보내지 못했어요. 잠시 뒤 다시 해 주세요' }, { status: 500 })
    }
}
