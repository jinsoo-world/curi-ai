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

        // 크리에이터 이름 조회
        const creatorIds = [...new Set(mentorList.map(m => m.creator_id).filter(Boolean))]
        const creatorNameMap = new Map<string, string>()
        if (creatorIds.length > 0) {
            const { data: creators } = await admin
                .from('creator_profiles')
                .select('id, user_id, display_name')
                .in('id', creatorIds)

            if (creators && creators.length > 0) {
                const creatorUserIds = creators.map(c => c.user_id).filter(Boolean)
                const { data: creatorUsers } = await admin
                    .from('users')
                    .select('id, display_name, email')
                    .in('id', creatorUserIds)

                const userNameMap = new Map((creatorUsers || []).map(u => [u.id, u.display_name || u.email?.split('@')[0] || '알 수 없음']))
                for (const c of creators) {
                    creatorNameMap.set(c.id, c.display_name || userNameMap.get(c.user_id) || '알 수 없음')
                }
            }
        }

        // 멘토에 크리에이터 이름 추가
        const mentorListWithCreator = mentorList.map(m => ({
            ...m,
            creator_name: creatorNameMap.get(m.creator_id) || '알 수 없음',
        }))

        // 통계 계산
        let totalMessages = 0
        let totalUsers = 0
        // 익명 요약만: 봇별 합계(메시지 수, 대화한 사람 수). 회원 이름과 회원별 메시지 수는 내려주지 않는다 (대표 승인 1005)
        const mentorStats: Record<string, { messages: number; users: number }> = {}

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
                for (const s of sessions) {
                    if (!mentorStats[s.mentor_id]) {
                        mentorStats[s.mentor_id] = { messages: 0, users: 0 }
                    }
                    mentorStats[s.mentor_id].messages += (s.message_count || 0)
                }

                // AI별 고유 사용자 수 (사람 목록은 만들지 않는다)
                for (const mentorId of Object.keys(mentorStats)) {
                    const people = new Set<string>()
                    for (const s of sessions) if (s.mentor_id === mentorId) people.add(s.user_id)
                    mentorStats[mentorId].users = people.size
                }
            }
        }

        const stats = {
            total: mentorList.length,
            active: mentorList.filter(m => m.status === 'active' && m.is_active).length,
            totalMessages,
            totalUsers,
        }

        return NextResponse.json({ success: true, mentors: mentorListWithCreator, stats, mentorStats, role: 'creator', isAdmin })
    } catch (error: unknown) {
        console.error('[Creator List API] Error:', error)
        const message = error instanceof Error ? error.message : '멘토 목록 조회 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
