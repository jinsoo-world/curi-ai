// /api/admin/ebook-logs — 어드민용 전자책 로그 조회 API
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const admin = createAdminClient()

        const { data: logs, error } = await admin
            .from('ebook_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200)

        if (error) {
            console.error('[Admin Ebook Logs]', error.message)
            return Response.json({ error: error.message }, { status: 500 })
        }

        // user_id로 사용자 정보 조회
        const userIds = [...new Set((logs || []).map(l => l.user_id).filter(Boolean))]
        const mentorIds = [...new Set((logs || []).map(l => l.mentor_id).filter(Boolean))]

        let userMap: Record<string, string> = {}
        let mentorMap: Record<string, string> = {}

        if (userIds.length > 0) {
            const { data: users } = await admin
                .from('users')
                .select('id, display_name, email')
                .in('id', userIds)
            users?.forEach(u => {
                userMap[u.id] = u.display_name || u.email || '알 수 없음'
            })
        }

        if (mentorIds.length > 0) {
            const { data: mentors } = await admin
                .from('mentors')
                .select('id, name')
                .in('id', mentorIds)
            mentors?.forEach(m => {
                mentorMap[m.id] = m.name
            })
        }

        const enrichedLogs = (logs || []).map(log => ({
            ...log,
            user_name: userMap[log.user_id] || '알 수 없음',
            mentor_name: mentorMap[log.mentor_id] || '-',
        }))

        // 통계
        const generateCount = enrichedLogs.filter(l => l.action === 'generate').length
        const downloadCount = enrichedLogs.filter(l => l.action === 'download').length
        const uniqueUsers = new Set(enrichedLogs.map(l => l.user_id).filter(Boolean)).size

        return Response.json({
            logs: enrichedLogs,
            stats: {
                generateCount,
                downloadCount,
                uniqueUsers,
                conversionRate: generateCount > 0
                    ? Math.round((downloadCount / generateCount) * 100)
                    : 0,
            },
        })
    } catch (error) {
        console.error('[Admin Ebook Logs Error]', error)
        return Response.json({ error: '조회 실패' }, { status: 500 })
    }
}
