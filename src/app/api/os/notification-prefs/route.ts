// GET   /api/os/notification-prefs → 내 알림 설정 + 화면에 필요한 상태(푸시 공개열쇠·문자 준비 여부·가린 전화번호)
// PATCH /api/os/notification-prefs → 고칠 칸만 보낸다 { push?, sms?, email?, quietFrom?, quietTo? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseStore, savePrefs, vapidPublicKey, pushReady, smsEnabled, emailReady, maskPhone, maskEmail } from '@/domains/messaging'
import { smsReady } from '@/lib/sms'
import type { NotificationPrefs } from '@/domains/messaging'

export const dynamic = 'force-dynamic'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const db = createAdminClient()
    const prefs = await createSupabaseStore(db).getPrefs(user.id)
    const { data: row } = await db.from('users').select('phone').eq('id', user.id).maybeSingle()
    return NextResponse.json({
        prefs,
        phoneMasked: maskPhone((row as { phone?: string | null } | null)?.phone),
        emailMasked: maskEmail(user.email),
        pushConfigured: pushReady(),
        vapidPublicKey: vapidPublicKey(),
        smsAvailable: smsEnabled() && smsReady(),
        emailAvailable: emailReady(),
    })
}

export async function PATCH(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as Partial<NotificationPrefs>
    const patch: Partial<NotificationPrefs> = {}
    for (const k of ['push', 'sms', 'email'] as const) if (typeof body[k] === 'boolean') patch[k] = body[k]
    for (const k of ['quietFrom', 'quietTo'] as const) {
        if (body[k] === undefined) continue
        if (body[k] !== null && !TIME_RE.test(String(body[k]))) return NextResponse.json({ error: '시간은 HH:MM 꼴로 보내 주세요' }, { status: 400 })
        patch[k] = body[k]
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: '바꿀 것이 없어요' }, { status: 400 })

    try {
        const prefs = await savePrefs(createAdminClient(), user.id, patch)
        return NextResponse.json({ prefs })
    } catch (e) {
        console.error('[os/notification-prefs PATCH]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '설정을 저장하지 못했어요(표가 아직 없을 수 있어요)' }, { status: 503 })
    }
}
