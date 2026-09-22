// POST /api/os/messages/notify-me — 나(주인)에게 알림. 루틴 결과·승인 요청 도착·클로버 부족.
// body: { channel?: 'push'|'sms'|'email' (기본 push), subject?, body, url? }
// 받는 곳은 내 것만: 문자 = users.phone, 이메일 = 로그인 이메일. 남의 번호를 넣을 칸이 없다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { dispatchWith } from '@/domains/messaging'
import type { Channel } from '@/domains/messaging'

export const dynamic = 'force-dynamic'

const CHANNELS: Channel[] = ['push', 'sms', 'email']

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('msg', user.id), 5, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('알림') }, { status: 429 })

    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const channel = (CHANNELS.includes(b.channel as Channel) ? b.channel : 'push') as Channel
    const text = typeof b.body === 'string' ? b.body.trim() : ''
    if (!text || text.length > 2000) return NextResponse.json({ error: '본문은 1~2000자' }, { status: 400 })

    let to: string | undefined
    if (channel === 'sms') {
        const { data: row } = await db.from('users').select('phone').eq('id', user.id).maybeSingle()
        to = (row as { phone?: string | null } | null)?.phone ?? undefined
        if (!to) return NextResponse.json({ status: 'blocked', message: '등록된 전화번호가 없어요.' }, { status: 403 })
    } else if (channel === 'email') {
        to = user.email ?? undefined
    }

    const url = typeof b.url === 'string' && b.url.startsWith('/') ? b.url : '/os'
    const outcome = await dispatchWith(db, {
        audience: 'self',
        message: { channel, userId: user.id, to, subject: typeof b.subject === 'string' ? b.subject.slice(0, 200) : '큐리AI', body: text, url },
    })
    return NextResponse.json(outcome, { status: outcome.status === 'blocked' ? 403 : outcome.status === 'failed' ? 502 : 200 })
}
