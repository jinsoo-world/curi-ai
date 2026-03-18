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
            .select('id, email, display_name, avatar_url, membership_tier, concern, onboarding_completed, created_at, phone, marketing_consent, clovers, gender, referral_code, birth_year, auth_provider')
            .eq('id', userId)
            .single()

        if (userError || !user) {
            return NextResponse.json({ error: '유저를 찾을 수 없습니다' }, { status: 404 })
        }

        // 유저의 모든 세션 + 멘토 정보
        const { data: sessions } = await supabase
            .from('chat_sessions')
            .select(`
                id, title, message_count, last_message_at, created_at, deleted_at,
                mentors ( id, name, slug, avatar_url )
            `)
            .eq('user_id', userId)
            .order('last_message_at', { ascending: false, nullsFirst: false })

        // 세션별 음성 대화 여부 확인 (input_method='stt' 메시지가 있으면 음성 세션)
        const sessionIds = sessions?.map(s => s.id) || []
        let voiceSessionIds: Set<string> = new Set()
        if (sessionIds.length > 0) {
            const { data: voiceMessages } = await supabase
                .from('messages')
                .select('session_id')
                .in('session_id', sessionIds)
                .eq('input_method', 'stt')
            voiceMessages?.forEach(m => voiceSessionIds.add(m.session_id))
        }

        const enrichedSessions = (sessions || []).map(s => ({
            ...s,
            has_voice: voiceSessionIds.has(s.id),
        }))

        // 통계 요약
        const totalSessions = enrichedSessions.length
        const totalMessages = enrichedSessions.reduce((sum, s) => sum + (s.message_count || 0), 0)
        const mentorSet = new Set(enrichedSessions.map(s => (s.mentors as any)?.name).filter(Boolean))

        return NextResponse.json({
            user,
            sessions: enrichedSessions,
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
