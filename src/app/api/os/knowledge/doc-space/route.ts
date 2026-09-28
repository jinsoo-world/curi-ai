// GET /api/os/knowledge/doc-space — 이번 달 자료 넣기 퍼센트 (쪽 수는 돌려주지 않음)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { docParseEnabled, docSpaceView, readMonthlyFilePages } from '@/domains/knowledge/doc-parse'
import { readPlanId } from '@/domains/os/usage-db'
import type { PagePlan } from '@/domains/knowledge/page-limits'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    if (!docParseEnabled()) return NextResponse.json({ enabled: false })
    try {
        const db = createAdminClient()
        const [plan, used] = await Promise.all([readPlanId(db, user.id), readMonthlyFilePages(db, user.id)])
        return NextResponse.json(docSpaceView(plan as PagePlan, used))
    } catch (e) {
        console.error('[os/knowledge/doc-space]', e instanceof Error ? e.message : e)
        return NextResponse.json({ enabled: false })
    }
}
