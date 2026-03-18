import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
    try {
        const supabase = createAdminClient()

        // 최근 매칭 로그 50건
        const { data: logs, error } = await supabase
            .from('mentor_match_logs')
            .select(`
                id,
                user_id,
                concern,
                matched_mentor_name,
                match_reason,
                match_type,
                is_guest,
                clicked_start,
                created_at
            `)
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) {
            console.error('[Admin Match Logs] Error:', error.message)
            return NextResponse.json({ logs: [], stats: {} })
        }

        // 통계 계산
        const total = logs?.length || 0
        const guestLogs = logs?.filter(l => l.is_guest) || []
        const memberLogs = logs?.filter(l => !l.is_guest) || []
        const guestCount = guestLogs.length
        const memberCount = memberLogs.length
        // 이탈율 = 클릭 안 한 비율
        const memberChurnCount = memberLogs.filter(l => !l.clicked_start).length
        const guestChurnCount = guestLogs.filter(l => !l.clicked_start).length
        const memberChurnRate = memberCount > 0 ? Math.round((memberChurnCount / memberCount) * 100) : 0
        const guestChurnRate = guestCount > 0 ? Math.round((guestChurnCount / guestCount) * 100) : 0

        // 유저 이메일 매핑
        const userIds = [...new Set(logs?.filter(l => l.user_id).map(l => l.user_id) || [])]
        let userMap: Record<string, string> = {}
        if (userIds.length > 0) {
            const { data: users } = await supabase
                .from('users')
                .select('id, email, display_name')
                .in('id', userIds)
            if (users) {
                users.forEach(u => {
                    userMap[u.id] = u.display_name || u.email || u.id.slice(0, 8)
                })
            }
        }

        // 로그에 유저 정보 추가
        const enrichedLogs = logs?.map(l => ({
            ...l,
            user_display: l.user_id ? (userMap[l.user_id] || '회원') : '비회원',
        })) || []

        return NextResponse.json({
            logs: enrichedLogs,
            stats: {
                total,
                guestCount,
                memberCount,
                memberChurnRate,
                guestChurnRate,
            },
        })

    } catch (error: any) {
        console.error('[Admin Match Logs Error]', error.message)
        return NextResponse.json({ logs: [], stats: {} })
    }
}
