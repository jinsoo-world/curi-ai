// POST /api/os/messages/send — 봇이 남에게 보내는 메시지. 허용된 승인 카드 id 가 없으면 관문이 막는다.
// body: { permissionRequestId, channel: 'push'|'sms'|'email', to, subject?, body, html?, approvalMode? }
// 메일은 ①승인 카드를 먼저 확인하고(카드 없이 반송 명단을 떠보지 못하게) ②잠금(outbound-guard)을 지난다:
//   한 번에 한 분 · 광고 금지 · 1인 하루 20통/새 받는 분 5명 · 반송 명단.
//   끄는 스위치 OS_OUTBOUND_MAIL_ENABLED=0/false/off. 큐리어스와 같은 SES 계정이라 한 사람의 남용이 회사 메일을 멈출 수 있다.
// 문자는 이 길에서 따로 꺼져 있다. OS_OUTBOUND_SMS_ENABLED='1' 이어야만 관문으로 간다(SMS_ENABLED 와 별개).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { dispatchWith, createSupabaseStore } from '@/domains/messaging'
import type { Channel } from '@/domains/messaging'
import { guardOutboundEmail, createOutboundGuardStore } from '@/domains/messaging/outbound-guard'

export const dynamic = 'force-dynamic'

const CHANNELS: Channel[] = ['push', 'sms', 'email']
const MODES = new Set(['always_ask', 'draft_only', 'auto_safe'])

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('msg', user.id), 5, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('보내기') }, { status: 429 })

    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const channel = b.channel as Channel
    if (!CHANNELS.includes(channel)) return NextResponse.json({ error: '채널은 push·sms·email 중 하나예요' }, { status: 400 })
    const text = typeof b.body === 'string' ? b.body.trim() : ''
    if (!text || text.length > 4000) return NextResponse.json({ error: '본문은 1~4000자' }, { status: 400 })
    const permissionRequestId = typeof b.permissionRequestId === 'string' && b.permissionRequestId ? b.permissionRequestId : null
    if (!permissionRequestId) return NextResponse.json({ error: '승인 카드 id 가 필요해요' }, { status: 400 })

    if (channel === 'sms' && process.env.OS_OUTBOUND_SMS_ENABLED !== '1') {
        return NextResponse.json({ error: '봇이 다른 분께 문자를 보내는 기능은 아직 꺼져 있어요.' }, { status: 403 })
    }
    let toHash: string | undefined
    let reservationId: string | null = null
    const guardStore = createOutboundGuardStore(db)
    if (channel === 'email') {
        // 승인 카드 먼저. 없거나 남의 카드면 잠금·반송 명단을 보지도 않고 돌려보낸다(관문 dispatch 도 다시 본다)
        const card = await createSupabaseStore(db).getApprovedRequest(permissionRequestId, user.id).catch(() => null)
        if (!card) {
            const message = '허용된 승인 카드가 없어 보내지 않았어요.'
            return NextResponse.json({ status: 'blocked', reason: 'no_permission', message, error: message }, { status: 403 })
        }
        const g = await guardOutboundEmail(
            { userId: user.id, permissionRequestId: card.id, to: b.to, subject: b.subject, body: text, html: b.html },
            { store: guardStore },
        )
        if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status })
        toHash = g.toHash
        reservationId = g.reservationId
    }

    try {
        const outcome = await dispatchWith(db, {
            audience: 'other',
            permissionRequestId,
            approvalMode: MODES.has(String(b.approvalMode)) ? (b.approvalMode as 'always_ask' | 'draft_only' | 'auto_safe') : undefined,
            message: {
                channel,
                userId: user.id,   // 카드 주인 = 로그인한 사용자. 남의 카드는 관문이 찾지 못해 blocked
                to: typeof b.to === 'string' ? b.to.trim() : Array.isArray(b.to) && typeof b.to[0] === 'string' ? b.to[0].trim() : undefined,
                toHash,
                subject: typeof b.subject === 'string' ? b.subject.slice(0, 200) : undefined,
                body: text,
                html: typeof b.html === 'string' ? b.html : undefined,
            },
        })
        return NextResponse.json(outcome, { status: outcome.status === 'blocked' ? 403 : outcome.status === 'failed' ? 502 : 200 })
    } finally {
        // 보내는 중 줄은 지운다. 최종 기록(보냄·실패·막힘)은 관문이 따로 적는다
        if (reservationId) await guardStore.release(reservationId).catch(e => console.warn('[messages/send] 예약 풀기 실패', e instanceof Error ? e.message : e))
    }
}
