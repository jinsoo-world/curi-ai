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

        if (mentorIds.length > 0) {
            // 전체 메시지 수
            const { count: msgCount } = await admin
                .from('chat_messages')
                .select('*', { count: 'exact', head: true })
                .in('mentor_id', mentorIds)

            totalMessages = msgCount || 0

            // 대화한 사용자 수 (unique user_id)
            const { data: sessions } = await admin
                .from('chat_sessions')
                .select('user_id')
                .in('mentor_id', mentorIds)

            if (sessions) {
                const uniqueUsers = new Set(sessions.map(s => s.user_id))
                totalUsers = uniqueUsers.size
            }
        }

        const stats = {
            total: mentorList.length,
            active: mentorList.filter(m => m.status === 'active' && m.is_active).length,
            totalMessages,
            totalUsers,
        }

        return NextResponse.json({ success: true, mentors: mentorList, stats, role: 'creator' })
    } catch (error: unknown) {
        console.error('[Creator List API] Error:', error)
        const message = error instanceof Error ? error.message : '멘토 목록 조회 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
