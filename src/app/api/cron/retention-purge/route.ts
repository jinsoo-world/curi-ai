// 탈퇴한 리더의 정산 정보를 1년이 지나면 지운다 (대표 확정 2026-10-01 「1년」).
// 하루 한 번 새벽 5시(UTC 기준 vercel.json). 보관함 = retained_payout_profiles. 앱 연결 임시 표 청소도 여기서 한다.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { purgeExpiredPayouts } from '@/domains/account/delete'
import { purgeAppConnectRows } from '@/domains/connectors'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    if (!열쇠 || req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }
    const db = createAdminClient()
    await purgeExpiredPayouts(db)
    await purgeAppConnectRows(db)   // 앱 연결 1회용 번호·임시 보관 중 하루 지난 행
    return NextResponse.json({ success: true })
}
