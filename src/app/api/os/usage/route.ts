// GET /api/os/usage → 내 사용 한도 한 줄 (5시간 창 + 주간)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readUsage } from '@/domains/os/usage-db'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ guest: true })
    try {
        const v = await readUsage(createAdminClient(), user.id, new Date(), user.email)
        return NextResponse.json(v)
    } catch (e) {
        console.error('[os/usage]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '사용 한도를 읽지 못했어요' }, { status: 500 })
    }
}
