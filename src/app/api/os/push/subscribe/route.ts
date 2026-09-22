// POST   /api/os/push/subscribe  → 이 기기의 푸시 구독을 등록(같은 endpoint 면 덧씀)
// DELETE /api/os/push/subscribe  → 이 기기의 구독을 지움
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TABLE_MISSING } from '@/domains/messaging'

export const dynamic = 'force-dynamic'

type SubJson = { endpoint?: string; keys?: { p256dh?: string; auth?: string } }

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { subscription?: SubJson; userAgent?: string }
    const sub = body.subscription
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || !/^https:\/\//.test(sub.endpoint)) {
        return NextResponse.json({ error: '구독 정보가 비었어요' }, { status: 400 })
    }
    const { error } = await createAdminClient().from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        user_agent: (body.userAgent ?? '').toString().slice(0, 200) || null,
    }, { onConflict: 'endpoint' })
    if (error) {
        if (error.code === TABLE_MISSING) return NextResponse.json({ error: '푸시 표가 아직 준비되지 않았어요(관리자에게 알려 주세요)', tableMissing: true }, { status: 503 })
        console.error('[os/push/subscribe POST]', error.message)
        return NextResponse.json({ error: '구독을 저장하지 못했어요' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const { endpoint } = await req.json().catch(() => ({})) as { endpoint?: string }
    if (!endpoint) return NextResponse.json({ error: 'endpoint 가 비었어요' }, { status: 400 })
    const { error } = await createAdminClient().from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint)
    if (error && error.code !== TABLE_MISSING) {
        console.error('[os/push/subscribe DELETE]', error.message)
        return NextResponse.json({ error: '구독을 지우지 못했어요' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}
