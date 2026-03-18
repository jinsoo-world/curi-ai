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
        // 전체 멘토 목록
        const { data: mentorsList } = await supabase
            .from('mentors')
            .select('id, name, slug, title')

        // 멘토별 통계 직접 계산
        const mentors = await Promise.all(
            (mentorsList || []).map(async (mentor) => {
                // 세션 수 (전체)
                const { count: totalSessions } = await supabase
                    .from('chat_sessions')
                    .select('*', { count: 'exact', head: true })
                    .eq('mentor_id', mentor.id)

                // 비회원 세션 수 (user_id IS NULL)
                const { count: guestSessions } = await supabase
                    .from('chat_sessions')
                    .select('*', { count: 'exact', head: true })
                    .eq('mentor_id', mentor.id)
                    .is('user_id', null)

                const memberSessions = (totalSessions || 0) - (guestSessions || 0)

                // 고유 유저 수 (회원만)
                const { data: userIds } = await supabase
                    .from('chat_sessions')
                    .select('user_id')
                    .eq('mentor_id', mentor.id)
                    .not('user_id', 'is', null)
                const uniqueUsers = new Set(userIds?.map(u => u.user_id).filter(Boolean)).size

                // 총 메시지 수 (해당 멘토의 세션들 → 메시지)
                const { data: sessions } = await supabase
                    .from('chat_sessions')
                    .select('id')
                    .eq('mentor_id', mentor.id)
                const sessionIds = sessions?.map(s => s.id) || []

                let totalMessages = 0
                if (sessionIds.length > 0) {
                    const { count } = await supabase
                        .from('messages')
                        .select('*', { count: 'exact', head: true })
                        .in('session_id', sessionIds)
                    totalMessages = count || 0
                }

                // 마지막 활동
                const { data: lastSession } = await supabase
                    .from('chat_sessions')
                    .select('last_message_at')
                    .eq('mentor_id', mentor.id)
                    .order('last_message_at', { ascending: false })
                    .limit(1)

                const avgMessagesPerSession = (totalSessions || 0) > 0
                    ? totalMessages / (totalSessions || 1)
                    : 0

                return {
                    mentor_id: mentor.id,
                    mentor_name: mentor.name,
                    mentor_slug: mentor.slug,
                    mentor_title: mentor.title,
                    total_sessions: totalSessions || 0,
                    member_sessions: memberSessions,
                    guest_sessions: guestSessions || 0,
                    unique_users: uniqueUsers,
                    total_messages: totalMessages,
                    last_active_at: lastSession?.[0]?.last_message_at || null,
                    avg_messages_per_session: avgMessagesPerSession,
                }
            })
        )

        // 세션 수 기준 내림차순 정렬
        mentors.sort((a, b) => b.total_sessions - a.total_sessions)

        return NextResponse.json({ mentors })
    } catch (error) {
        console.error('Admin mentors error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
