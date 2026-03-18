import { NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
    const auth = await requireAdminAPI()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const supabase = createAdminClient()

    try {
        // Materialized View 갱신
        const { error } = await supabase.rpc('refresh_admin_views')

        if (error) {
            console.error('MV refresh error:', error)
            return NextResponse.json({ error: 'MV 갱신 실패: ' + error.message }, { status: 500 })
        }

        return NextResponse.json({
            ok: true,
            message: 'Materialized Views 갱신 완료',
            refreshedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Admin refresh-views error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
