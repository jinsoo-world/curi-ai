// POST /api/admin/push/test — 관리자만. 한 사람의 앱 기기 전부에 시험 알림을 보낸다(대표 폰으로 확인용).
// 몸통: { userId? (비우면 나), title?, body?, deeplink? }
// 시험 알림은 정보(info) 종류 TEST 로 남고, 하루 상한·조용한 시간·설정 꺼짐을 건너뛴다. 광고는 보내지 않는다.
// 다른 알림과 같은 관문(messaging dispatch → 앱 푸시)을 지난다.
import { NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEEPLINK_HOME, isUuid, toDispatchInput } from '@/domains/push'
import { dispatchWith } from '@/domains/messaging'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    const auth = await requireAdminAPI()
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const b = await req.json().catch(() => ({})) as { userId?: unknown; title?: unknown; body?: unknown; deeplink?: unknown }
    const userId = b.userId === undefined ? auth.user.id : b.userId
    if (!isUuid(userId)) return NextResponse.json({ error: 'userId 가 틀려요' }, { status: 400 })
    const text = (v: unknown, fallback: string, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback)
    const deeplink = typeof b.deeplink === 'string' && /^curiai:\/\//.test(b.deeplink) ? b.deeplink.slice(0, 300) : DEEPLINK_HOME

    try {
        const outcome = await dispatchWith(createAdminClient(), toDispatchInput({
            userId,
            type: 'TEST',
            category: 'info',
            title: text(b.title, '알림이 잘 와요', 80),
            body: text(b.body, '큐리AI 앱 알림 시험이에요. 눌러 보세요.', 300),
            deeplink,
            ignoreLimits: true,
        }))
        return NextResponse.json({ ok: true, outcome })
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[admin/push/test]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
