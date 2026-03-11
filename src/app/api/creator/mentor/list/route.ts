// /api/creator/mentor/list — 내가 만든 멘토 목록 + 통계
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 크리에이터 프로필 확인 (없으면 자동 생성)
        let { data: creator } = await admin
            .from('creator_profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle()

        if (!creator) {
            const { data: newCreator } = await admin
                .from('creator_profiles')
                .insert({
                    user_id: user.id,
                    display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '크리에이터',
                })
                .select('id')
                .single()
            creator = newCreator
        }

        if (!creator) {
            return NextResponse.json({
                success: true,
                mentors: [],
                stats: { total: 0, active: 0, totalMessages: 0, totalUsers: 0 },
                role: 'creator',
            })
        }

        // 어드민이면 전체 멘토, 일반 유저는 본인 것만
        const isAdmin = user.email === 'jin@mission-driven.kr'

        // 멘토 목록 (avatar_url 포함)
        let mentorQuery = admin
            .from('mentors')
            .select('id, name, title, mentor_type, status, is_active, created_at, creator_id, avatar_url')
            .neq('status', 'suspended')
            .order('created_at', { ascending: false })

        if (!isAdmin) {
            mentorQuery = mentorQuery.eq('creator_id', creator.id)
        }

        const { data: mentors, error } = await mentorQuery

        if (error) throw new Error(error.message)

        const mentorList = mentors || []
        const mentorIds = mentorList.map(m => m.id)

        // 통계 계산
        let totalMessages = 0
        let totalUsers = 0
        const mentorStats: Record<string, { messages: number; users: number; userList: { userId: string; displayName: string; messageCount: number }[] }> = {}

        if (mentorIds.length > 0) {
            // 세션 목록 (mentor_id, user_id, message_count 포함)
            const { data: sessions } = await admin
                .from('chat_sessions')
                .select('id, mentor_id, user_id, message_count')
                .in('mentor_id', mentorIds)
                .gt('message_count', 0)

            if (sessions && sessions.length > 0) {
                // 전체 메시지 수 합산
                totalMessages = sessions.reduce((sum, s) => sum + (s.message_count || 0), 0)

                // 전체 고유 사용자 수
                const allUsers = new Set(sessions.map(s => s.user_id))
                totalUsers = allUsers.size

                // AI별 통계 집계
                const userIdSet = new Set<string>()
                for (const s of sessions) {
                    if (!mentorStats[s.mentor_id]) {
                        mentorStats[s.mentor_id] = { messages: 0, users: 0, userList: [] }
                    }
                    mentorStats[s.mentor_id].messages += (s.message_count || 0)
                    userIdSet.add(s.user_id)
                }

                // AI별 고유 사용자 수 + 사용자별 메시지 수
                for (const mentorId of Object.keys(mentorStats)) {
                    const mentorSessions = sessions.filter(s => s.mentor_id === mentorId)
                    const userMap = new Map<string, number>()
                    for (const s of mentorSessions) {
                        userMap.set(s.user_id, (userMap.get(s.user_id) || 0) + (s.message_count || 0))
                    }
                    mentorStats[mentorId].users = userMap.size
                    mentorStats[mentorId].userList = Array.from(userMap.entries()).map(([userId, messageCount]) => ({
                        userId, displayName: '', messageCount,
                    }))
                }

                // 사용자 이름 일괄 조회
                const allUserIds = [...new Set(sessions.map(s => s.user_id))]
                if (allUserIds.length > 0) {
                    const { data: users } = await admin
                        .from('users')
                        .select('id, display_name')
                        .in('id', allUserIds)

                    const nameMap = new Map((users || []).map(u => [u.id, u.display_name || '익명']))
                    for (const ms of Object.values(mentorStats)) {
                        for (const u of ms.userList) {
                            u.displayName = nameMap.get(u.userId) || '익명'
                        }
                        // 메시지 수 내림차순 정렬
                        ms.userList.sort((a, b) => b.messageCount - a.messageCount)
                    }
                }
            }
        }

        const stats = {
            total: mentorList.length,
            active: mentorList.filter(m => m.status === 'active' && m.is_active).length,
            totalMessages,
            totalUsers,
        }

        return NextResponse.json({ success: true, mentors: mentorList, stats, mentorStats, role: 'creator' })
    } catch (error: unknown) {
        console.error('[Creator List API] Error:', error)
        const message = error instanceof Error ? error.message : '멘토 목록 조회 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
