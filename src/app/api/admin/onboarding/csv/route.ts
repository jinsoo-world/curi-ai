// 관리자 「가입 온보딩」 CSV 내려받기 (대표 승인 0928). ?from=YYYY-MM-DD&to=YYYY-MM-DD (KST)
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { kstRange, loadOnboarding, toCsv } from '@/domains/os/onboarding-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const auth = await requireAdminAPI()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const sp = req.nextUrl.searchParams
    const range = kstRange(sp.get('from'), sp.get('to'))
    try {
        const d = await loadOnboarding(createAdminClient(), range.startIso, range.endIso)
        return new NextResponse(toCsv(d.users, d.rows, d.botOwners, d.chatUsers), {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="onboarding_${range.from}_${range.to}.csv"`,
                'Cache-Control': 'no-store',
            },
        })
    } catch (e) {
        console.error('[admin/onboarding/csv]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '읽지 못했어요' }, { status: 500 })
    }
}
