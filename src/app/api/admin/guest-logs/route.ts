import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
    try {
        const supabase = createAdminClient()

        const { data: logs, error } = await supabase
            .from('guest_chat_logs')
            .select('id, mentor_id, mentor_name, user_message, ai_response, message_index, created_at')
            .order('created_at', { ascending: false })
            .limit(100)

        if (error) {
            console.error('[Admin Guest Logs]', error.message)
            return NextResponse.json({ logs: [], stats: {} })
        }

        // 통계
        const total = logs?.length || 0
        const mentorCounts: Record<string, number> = {}
        logs?.forEach(l => {
            const name = l.mentor_name || '알 수 없음'
            mentorCounts[name] = (mentorCounts[name] || 0) + 1
        })

        // 오늘 대화
        const today = new Date().toISOString().split('T')[0]
        const todayCount = logs?.filter(l => l.created_at?.startsWith(today)).length || 0

        return NextResponse.json({
            logs: logs || [],
            stats: { total, todayCount, mentorCounts },
        })
    } catch (error: any) {
        console.error('[Admin Guest Logs Error]', error.message)
        return NextResponse.json({ logs: [], stats: {} })
    }
}
