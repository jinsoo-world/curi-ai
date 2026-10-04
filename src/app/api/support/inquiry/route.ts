// POST /api/support/inquiry { category, email, body, platform?, appVersion?, website? }
// 고객센터 문의 한 건을 support_inquiries 표에 넣고 고객센터 메일로 한 통 알린다 (2026-10-02, 앱스토어 지원 주소).
// 로그인했으면 사용자 id 는 서버가 붙인다(몸통 값은 믿지 않는다). website 칸은 사람 눈에 안 보이는 꿀단지 = 차 있으면 기계.
// 알림 메일은 전체 1시간 NOTIFY_CAP_PER_HOUR 통까지. 넘어도 문의는 저장되고 관리자 목록에 보인다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { createEmailDriver } from '@/domains/messaging/drivers/email'
import { isTypeOn } from '@/domains/messaging'
import { validateInquiry, notificationText, safeReplyTo, SUPPORT_EMAIL, NOTIFY_CAP_PER_HOUR } from '@/domains/support/inquiry'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    const raw = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') return NextResponse.json({ error: '보낸 내용을 읽지 못했어요' }, { status: 400 })

    // 꿀단지: 기계에게는 성공처럼 답하고 아무것도 하지 않는다
    if (typeof raw.website === 'string' && raw.website.trim() !== '') return NextResponse.json({ ok: true })

    let userId: string | null = null
    try {
        const { data: { user } } = await (await createClient()).auth.getUser()
        userId = user?.id ?? null
    } catch { /* 로그인 확인이 실패해도 문의는 받는다 */ }

    const db = createAdminClient()
    // 한 사람(또는 한 IP)이 1시간에 5번까지
    const rl = await checkRateLimit(db, rateLimitKey('support', userId, null, req), 5, 3600)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('문의') }, { status: 429 })

    const v = validateInquiry(raw)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const i = v.value

    const { error } = await db.from('support_inquiries').insert({
        user_id: userId, email: i.email, category: i.category, body: i.body, platform: i.platform, app_version: i.appVersion,
    })
    if (error) {
        console.error('[support/inquiry] 저장 실패', error.message)
        return NextResponse.json({ error: '문의를 받지 못했어요. 잠시 뒤 다시 해 주세요.' }, { status: 500 })
    }

    // 알림 메일은 덤이다. 실패해도 문의는 이미 표에 있다. 경고에는 개인정보를 싣지 않는다
    try {
        // 회사 메일함으로 가는 내부 알림이라 관문 대신 그 자리에서 보낸다. 유형 장부(SUPPORT_NOTIFY)의 켬/끔은 본다
        const mail = createEmailDriver()
        if (!(await isTypeOn(db, 'SUPPORT_NOTIFY'))) {
            console.warn('[support/inquiry] 알림 메일 건너뜀: 유형 장부에서 꺼짐(SUPPORT_NOTIFY)')
        } else if (!mail.ready()) {
            console.warn('[support/inquiry] 알림 메일 건너뜀: 메일 열쇠가 연결되지 않음')
        } else {
            const since = new Date(Date.now() - 3600_000).toISOString()
            const { count, error: cErr } = await db.from('support_inquiries')
                .select('id', { count: 'exact', head: true }).gte('created_at', since)
            if (cErr) {
                console.warn('[support/inquiry] 알림 메일 건너뜀: 지난 1시간 문의 수를 못 셈', cErr.message)
            } else if ((count ?? 0) > NOTIFY_CAP_PER_HOUR) {
                console.warn(`[support/inquiry] 알림 메일 건너뜀: 지난 1시간 ${count}건, 한도 ${NOTIFY_CAP_PER_HOUR}`)
            } else {
                const n = notificationText(i)
                const r = await mail.send({
                    channel: 'email', userId: userId ?? 'support', to: SUPPORT_EMAIL,
                    subject: n.subject, body: n.body, replyTo: safeReplyTo(i.email),
                })
                if (!r.ok) console.warn('[support/inquiry] 알림 메일 실패', 'error' in r ? r.error : '')
            }
        }
    } catch (e) {
        console.warn('[support/inquiry] 알림 메일 오류', e instanceof Error ? e.name : 'unknown')
    }

    return NextResponse.json({ ok: true })
}
