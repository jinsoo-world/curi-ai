// GET /api/os/team/link/mine → 리더 대시보드용: 내가 만든 봇마다 연동 수 · 이번 달 신규 + 정산 정보가 있나
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listOwnerBotLinkStats } from '@/domains/os/team-link'
import { hasPayoutProfile } from '@/domains/os/payout'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const db = createAdminClient()
    try {
        const [bots, payoutReady] = await Promise.all([
            listOwnerBotLinkStats(db, user.id),
            hasPayoutProfile(db, user.id).catch(() => false),
        ])
        const totalLinks = bots.reduce((s, b) => s + b.linkCount, 0)
        const monthNew = bots.reduce((s, b) => s + b.monthNew, 0)
        return NextResponse.json({ bots, totalLinks, monthNew, payoutReady })
    } catch (e) {
        console.error('[os/team/link/mine GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ bots: [], totalLinks: 0, monthNew: 0, payoutReady: false })
    }
}
