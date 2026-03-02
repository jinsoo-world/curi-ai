import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const auth = await requireAdminAPI()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { sessionId } = await params
    const supabase = createAdminClient()

    try {
        const { data: messages, error } = await supabase
            .from('messages')
            .select('id, role, content, input_method, tokens_used, created_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })

        if (error) throw error

        return NextResponse.json({ messages: messages || [] })
    } catch (error) {
        console.error('Admin messages error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
