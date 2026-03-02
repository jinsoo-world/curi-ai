import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const auth = await requireAdminAPI()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { userId } = await params
    const supabase = createAdminClient()

    try {
        // 유저 기본 정보
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, display_name, avatar_url, membership_tier, concern, onboarding_completed, created_at')
            .eq('id', userId)
            .single()

        if (userError || !user) {
            return NextResponse.json({ error: '유저를 찾을 수 없습니다' }, { status: 404 })
        }

        // 유저의 모든 세션 + 멘토 정보
        const { data: sessions } = await supabase
            .from('chat_sessions')
            .select(`
                id, title, message_count, last_message_at, created_at,
                mentors ( id, name, slug, avatar_url )
            `)
            .eq('user_id', userId)
            .order('last_message_at', { ascending: false, nullsFirst: false })

        // 통계 요약
        const totalSessions = sessions?.length || 0
        const totalMessages = sessions?.reduce((sum, s) => sum + (s.message_count || 0), 0) || 0
        const mentorSet = new Set(sessions?.map(s => (s.mentors as any)?.name).filter(Boolean))

        return NextResponse.json({
            user,
            sessions: sessions || [],
            stats: {
                totalSessions,
                totalMessages,
                uniqueMentors: mentorSet.size,
                mentorNames: Array.from(mentorSet),
            },
        })
    } catch (error) {
        console.error('Admin user detail error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
