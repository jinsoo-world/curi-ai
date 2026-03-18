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
        const guestCount = logs?.filter(l => l.is_guest).length || 0
        const memberCount = total - guestCount
        const mentorCounts: Record<string, number> = {}
        logs?.forEach(l => {
            const name = l.matched_mentor_name || '알 수 없음'
            mentorCounts[name] = (mentorCounts[name] || 0) + 1
        })

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
                mentorCounts,
            },
        })

    } catch (error: any) {
        console.error('[Admin Match Logs Error]', error.message)
        return NextResponse.json({ logs: [], stats: {} })
    }
}
