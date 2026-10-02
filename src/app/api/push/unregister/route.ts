// POST /api/push/unregister — 로그아웃·탈퇴 직전에 앱이 부른다. 내 기기 번호만 지운다. 몸통: { token }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { unregisterDevice } from '@/domains/push'

export const dynamic = 'force-dynamic'

const TABLE_MISSING = new Set(['42P01', 'PGRST205'])

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const { token } = await req.json().catch(() => ({})) as { token?: unknown }
    if (typeof token !== 'string' || !token.trim() || token.length > 4096) return NextResponse.json({ error: '기기 번호가 비었어요' }, { status: 400 })

    const error = await unregisterDevice(createAdminClient(), user.id, token)
    if (error && !(error.code && TABLE_MISSING.has(error.code))) {
        console.error('[push/unregister]', error.message)
        return NextResponse.json({ error: '기기 번호를 지우지 못했어요' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}
