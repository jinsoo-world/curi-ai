// POST /api/os/report { mentorId, reason, detail?, messageExcerpt?, visitorId? } → 봇 신고 (애플 심사 지침 1.2)
// 로그인 회원(쿠키 또는 앱 Bearer)도, 손님(visitorId, 대화와 같은 값)도 된다.
// 7일 안 서로 다른 신고자 3명 = 봇을 자동으로 내리고 관리자 확인 대기에 올린다(domains/os/reports). 지우지 않는다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { parseReportBody, cleanVisitorId, submitReport, mentorExists, ReportTableMissing } from '@/domains/os/reports'

export const dynamic = 'force-dynamic'

/** 한 사람 10분에 5건, 같은 인터넷 주소(손님) 하루 20건 */
const PER_REPORTER = { limit: 5, windowSec: 600 }
const PER_IP_GUEST = { limit: 20, windowSec: 86_400 }

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
        if (!(await mentorExists(db, parsed.value.mentorId))) return NextResponse.json({ error: '그 봇을 찾지 못했어요' }, { status: 404 })
        await submitReport(db, { ...parsed.value, reporterUserId: user?.id ?? null, reporterVisitorId: visitorId })
        // 자동 내림 여부는 신고자에게 알리지 않는다
        return NextResponse.json({ ok: true, message: '신고했어요. 24시간 안에 확인할게요' })
    } catch (e) {
        if (e instanceof ReportTableMissing) return NextResponse.json({ error: '신고를 받을 준비가 아직 안 됐어요' }, { status: 503 })
        console.error('[os/report POST]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '신고를 보내지 못했어요. 잠시 뒤 다시 해 주세요' }, { status: 500 })
    }
}
