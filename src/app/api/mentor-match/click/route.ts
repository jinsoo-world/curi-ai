import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest) {
    try {
        const { logId } = await request.json()
        if (!logId) {
            return NextResponse.json({ error: 'logId required' }, { status: 400 })
        }

        const supabase = createAdminClient()
        await supabase
            .from('mentor_match_logs')
            .update({ clicked_start: true })
            .eq('id', logId)

        return NextResponse.json({ ok: true })
    } catch (error: any) {
        console.error('[Match Click Track]', error.message)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
