import { NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
    const auth = await requireAdminAPI()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const supabase = createAdminClient()

    try {
        // 일별 대화 추이 (MV)
        const { data: dailyStats } = await supabase
            .from('mv_daily_stats')
            .select('*')
            .order('date', { ascending: true })
            .limit(30)

        // 최근 대화 세션 (실시간)
        const { data: recentSessions } = await supabase
            .from('chat_sessions')
            .select(`
                id,
                user_id,
                mentor_id,
                message_count,
                last_message_at,
                created_at,
                mentors!inner(name, slug)
            `)
            .order('last_message_at', { ascending: false })
            .limit(20)

        // 입력 방식 비율 (최근 7일)
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
        const { count: textCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'user')
            .gte('created_at', weekAgo)
            .or('input_method.eq.text,input_method.is.null')

        const { count: sttCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'user')
            .eq('input_method', 'stt')
            .gte('created_at', weekAgo)

        return NextResponse.json({
            dailyStats: dailyStats || [],
            recentSessions: recentSessions || [],
            inputMethods: {
                text: textCount || 0,
                stt: sttCount || 0,
            },
        })
    } catch (error) {
        console.error('Admin conversations error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
