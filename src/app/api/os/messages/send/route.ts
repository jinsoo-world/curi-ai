// POST /api/os/messages/send — 봇이 남에게 보내는 메시지. 허용된 승인 카드 id 가 없으면 관문이 막는다.
// body: { permissionRequestId, channel: 'push'|'sms'|'email', to, subject?, body, html?, approvalMode? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { dispatchWith } from '@/domains/messaging'
import type { Channel } from '@/domains/messaging'

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

    const outcome = await dispatchWith(db, {
        audience: 'other',
        permissionRequestId,
        approvalMode: MODES.has(String(b.approvalMode)) ? (b.approvalMode as 'always_ask' | 'draft_only' | 'auto_safe') : undefined,
        message: {
            channel,
            userId: user.id,   // 카드 주인 = 로그인한 사용자. 남의 카드는 관문이 찾지 못해 blocked
            to: typeof b.to === 'string' ? b.to.trim() : undefined,
            subject: typeof b.subject === 'string' ? b.subject.slice(0, 200) : undefined,
            body: text,
            html: typeof b.html === 'string' ? b.html : undefined,
        },
    })
    return NextResponse.json(outcome, { status: outcome.status === 'blocked' ? 403 : outcome.status === 'failed' ? 502 : 200 })
}
