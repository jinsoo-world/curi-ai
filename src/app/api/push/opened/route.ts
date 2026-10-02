// POST /api/push/opened — 앱에서 알림을 눌렀을 때. 몸통: { sendId } (알림에 실려 온 push_sends.id)
// 「누른 비율」을 세려고 남긴다. 내 기록만, 처음 누른 시각만.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid, markOpened } from '@/domains/push'

export const dynamic = 'force-dynamic'

const TABLE_MISSING = new Set(['42P01', 'PGRST205'])

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const { sendId } = await req.json().catch(() => ({})) as { sendId?: unknown }
    if (!isUuid(sendId)) return NextResponse.json({ error: 'sendId 가 틀려요' }, { status: 400 })

    const error = await markOpened(createAdminClient(), user.id, sendId)
    if (error && !(error.code && TABLE_MISSING.has(error.code))) {
        console.error('[push/opened]', error.message)
        return NextResponse.json({ error: '기록하지 못했어요' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}
