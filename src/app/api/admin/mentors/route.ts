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
        // 전체 멘토 목록 (상태/아바타/설명/전문분야 포함)
        const { data: mentorsList } = await supabase
            .from('mentors')
            .select('id, name, slug, title, avatar_url, is_active, status, description, expertise, creator_id, created_at, voice_sample_url, greeting_message')
            .order('created_at', { ascending: true })

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

                // 총 메시지 수
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

                // 크리에이터 정보
                let creatorName = null
                if (mentor.creator_id) {
                    // creator_profiles → users 순서로 찾기
                    const { data: creator } = await supabase
                        .from('creator_profiles')
                        .select('display_name, user_id')
                        .eq('id', mentor.creator_id)
                        .maybeSingle()
                    if (creator?.display_name) {
                        creatorName = creator.display_name
                    } else if (creator?.user_id) {
                        const { data: userData } = await supabase
                            .from('users')
                            .select('display_name')
                            .eq('id', creator.user_id)
                            .single()
                        creatorName = userData?.display_name || null
                    }
                    // creator_id가 직접 user ID인 경우
                    if (!creatorName) {
                        const { data: directUser } = await supabase
                            .from('users')
                            .select('display_name')
                            .eq('id', mentor.creator_id)
                            .maybeSingle()
                        creatorName = directUser?.display_name || null
                    }
                }

                // 학습된 지식 소스 수
                const { count: knowledgeCount } = await supabase
                    .from('knowledge_sources')
                    .select('*', { count: 'exact', head: true })
                    .eq('mentor_id', mentor.id)

                // 멘토 상태 판단
                let mentorStatus: 'active' | 'inactive' | 'deleted' = 'active'
                if (mentor.status === 'deleted') {
                    mentorStatus = 'deleted'
                } else if (!mentor.is_active || mentor.status === 'inactive') {
                    mentorStatus = 'inactive'
                }

                return {
                    mentor_id: mentor.id,
                    mentor_name: mentor.name,
                    mentor_slug: mentor.slug,
                    mentor_title: mentor.title,
                    avatar_url: mentor.avatar_url || null,
                    status: mentorStatus,
                    description: mentor.description || '',
                    expertise: mentor.expertise || [],
                    creator_id: mentor.creator_id || null,
                    creator_name: creatorName,
                    created_at: mentor.created_at,
                    has_voice: !!mentor.voice_sample_url,
                    has_greeting: !!mentor.greeting_message,
                    knowledge_count: knowledgeCount || 0,
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
