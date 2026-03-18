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

        // 🔗 전환 트래킹: visitor_id로 회원 매칭
        const visitorIds = [...new Set(logs?.filter(l => l.visitor_id).map(l => l.visitor_id) || [])]
        let convertedMap: Record<string, { email: string; display_name: string | null; converted_at: string | null }> = {}

        if (visitorIds.length > 0) {
            const { data: convertedUsers } = await supabase
                .from('users')
                .select('visitor_id, email, display_name, converted_at')
                .in('visitor_id', visitorIds)

            if (convertedUsers) {
                convertedUsers.forEach(u => {
                    if (u.visitor_id) {
                        convertedMap[u.visitor_id] = {
                            email: u.email || '',
                            display_name: u.display_name || null,
                            converted_at: u.converted_at || null,
                        }
                    }
                })
            }
        }

        // 로그에 전환 정보 추가
        const enrichedLogs = logs?.map(l => ({
            ...l,
            converted: l.visitor_id ? !!convertedMap[l.visitor_id] : false,
            converted_user: l.visitor_id ? convertedMap[l.visitor_id] || null : null,
        })) || []

        // 통계
        const total = enrichedLogs.length
        const mentorCounts: Record<string, number> = {}
        const countryCounts: Record<string, number> = {}
        const deviceCounts: Record<string, number> = {}
        const uniqueVisitors = new Set<string>()

        enrichedLogs.forEach(l => {
            const name = l.mentor_name || '알 수 없음'
            mentorCounts[name] = (mentorCounts[name] || 0) + 1

            if (l.country) countryCounts[l.country] = (countryCounts[l.country] || 0) + 1
            if (l.device_type) deviceCounts[l.device_type] = (deviceCounts[l.device_type] || 0) + 1
            if (l.visitor_id) uniqueVisitors.add(l.visitor_id)
        })

        const today = new Date().toISOString().split('T')[0]
        const todayCount = enrichedLogs.filter(l => l.created_at?.startsWith(today)).length

        return NextResponse.json({
            logs: enrichedLogs,
            stats: {
                total,
                todayCount,
                mentorCounts,
                countryCounts,
                deviceCounts,
                uniqueVisitors: uniqueVisitors.size,
                convertedCount: Object.keys(convertedMap).length,
            },
        })
    } catch (error: any) {
        console.error('[Admin Guest Logs Error]', error.message)
        return NextResponse.json({ logs: [], stats: {} })
    }
}
