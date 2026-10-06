// ⑤ P089 「3일 안부」 앱 알림(광고). 매일 서울 10시 = UTC 01시(vercel.json).
// 받을 사람 고르기·규칙은 domains/push/checkin.ts. 광고 금지 시간(21~08시)에 불리면 아무것도 안 하고 끝난다.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pushConfigured } from '@/domains/push'
import { createSupabaseP089Reader, liveP089Sender, runP089 } from '@/domains/push/checkin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    if (!열쇠 || req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }
    if (!pushConfigured()) return NextResponse.json({ success: true, skipped: 'not_configured' })
    const db = createAdminClient({ longRunning: true })
    try {
        const result = await runP089({ reader: createSupabaseP089Reader(db), send: liveP089Sender(db) })
        console.log('[cron/push-checkin]', JSON.stringify(result))
        return NextResponse.json({ success: true, ...result })
    } catch (e) {
        console.error('[cron/push-checkin] 실패', e instanceof Error ? e.message : e)
        return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
}
