// 캠페인 예약 보내기 — 매일 서울 10시 10분 = UTC 01:10 (vercel.json). Hobby 요금제라 하루 1번만 된다.
// 캠페인마다 크론 줄을 새로 만들지 않는다(9/8 유령 발송 사고). 이 작업 하나가 「보낼 시각이 된 줄」만 한 번 보낸다.
// 그 사이 시각은 관리자 화면 「지금 보내기」가 같은 함수로 보낸다. 멈춤 스위치 MSG_CAMPAIGNS_ENABLED=0/false/off.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runDueCampaigns } from '@/domains/messaging/campaign'
import { createSupabaseCampaignStore, liveCampaignSender } from '@/domains/messaging/campaign-store'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    if (!열쇠 || req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }
    const db = createAdminClient()
    try {
        const result = await runDueCampaigns({ store: createSupabaseCampaignStore(db), send: liveCampaignSender(db), deadline: Date.now() + 240_000 })
        console.log('[cron/campaigns]', JSON.stringify(result))
        return NextResponse.json({ success: true, ...result })
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        // 표가 아직 없으면(마이그레이션 전) 조용히 끝난다
        if (/message_campaigns/.test(message) && /does not exist|Could not find/.test(message)) return NextResponse.json({ success: true, skipped: 'no_table' })
        console.error('[cron/campaigns] 실패', message)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}
