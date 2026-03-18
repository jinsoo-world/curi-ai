import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
    try {
        const supabase = createAdminClient()

        const { data: logs, error } = await supabase
            .from('guest_chat_logs')
            .select('id, mentor_id, mentor_name, user_message, ai_response, message_index, created_at, ip_address, device_type, os, browser, country, city, visitor_id')
            .order('created_at', { ascending: false })
            .limit(200)

        if (error) {
            console.error('[Admin Guest Logs]', error.message)
            return NextResponse.json({ logs: [], stats: {} })
        }

        // 통계
        const total = logs?.length || 0
        const mentorCounts: Record<string, number> = {}
        const countryCounts: Record<string, number> = {}
        const deviceCounts: Record<string, number> = {}
        const uniqueVisitors = new Set<string>()

        logs?.forEach(l => {
            const name = l.mentor_name || '알 수 없음'
            mentorCounts[name] = (mentorCounts[name] || 0) + 1

            if (l.country) countryCounts[l.country] = (countryCounts[l.country] || 0) + 1
            if (l.device_type) deviceCounts[l.device_type] = (deviceCounts[l.device_type] || 0) + 1
            if (l.visitor_id) uniqueVisitors.add(l.visitor_id)
        })

        // 오늘 대화
        const today = new Date().toISOString().split('T')[0]
        const todayCount = logs?.filter(l => l.created_at?.startsWith(today)).length || 0

        return NextResponse.json({
            logs: logs || [],
            stats: {
                total,
                todayCount,
                mentorCounts,
                countryCounts,
                deviceCounts,
                uniqueVisitors: uniqueVisitors.size,
            },
        })
    } catch (error: any) {
        console.error('[Admin Guest Logs Error]', error.message)
        return NextResponse.json({ logs: [], stats: {} })
    }
}
