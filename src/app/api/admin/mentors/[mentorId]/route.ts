import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ mentorId: string }> }
) {
    const auth = await requireAdminAPI()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { mentorId } = await params
    const supabase = createAdminClient()

    try {
        // 멘토 기본 정보
        const { data: mentor, error: mentorError } = await supabase
            .from('mentors')
            .select('id, name, slug, title, avatar_url, is_active, status, description, expertise, creator_id, created_at, voice_sample_url, greeting_message')
            .eq('id', mentorId)
            .single()

        if (mentorError || !mentor) {
            return NextResponse.json({ error: '멘토를 찾을 수 없습니다' }, { status: 404 })
        }

        // === ① 회원 대화 내역 (chat_sessions + messages) ===
        const { data: memberSessions } = await supabase
            .from('chat_sessions')
            .select(`
                id, user_id, title, message_count, last_message_at, created_at,
                users ( id, email, display_name, avatar_url )
            `)
            .eq('mentor_id', mentorId)
            .not('user_id', 'is', null)
            .order('last_message_at', { ascending: false, nullsFirst: false })

        // 각 세션의 최근 메시지 가져오기
        const enrichedMemberSessions = await Promise.all(
            (memberSessions || []).map(async (session) => {
                const { data: msgs } = await supabase
                    .from('messages')
                    .select('role, content, created_at')
                    .eq('session_id', session.id)
                    .order('created_at', { ascending: true })

                return {
                    ...session,
                    messages: msgs || [],
                }
            })
        )

        // === ② 비회원 대화 내역 (guest_chat_logs) ===
        const { data: guestLogs } = await supabase
            .from('guest_chat_logs')
            .select('id, visitor_id, user_message, ai_response, created_at, device_type, os, browser, country, city')
            .eq('mentor_id', mentorId)
            .order('created_at', { ascending: false })

        // visitor_id별로 그룹핑 (비회원 세션처럼 보이도록)
        const guestByVisitor: Record<string, typeof guestLogs> = {}
        guestLogs?.forEach(log => {
            const vid = log.visitor_id || 'unknown'
            if (!guestByVisitor[vid]) guestByVisitor[vid] = []
            guestByVisitor[vid]!.push(log)
        })

        const guestSessions = Object.entries(guestByVisitor).map(([visitorId, logs]) => ({
            visitor_id: visitorId,
            message_count: logs!.length,
            first_message_at: logs![logs!.length - 1]?.created_at,
            last_message_at: logs![0]?.created_at,
            device: logs![0]?.device_type || null,
            country: logs![0]?.country || null,
            messages: logs!.map(l => ({
                user_message: l.user_message,
                ai_response: l.ai_response,
                created_at: l.created_at,
            })),
        }))

        // === 통계 ===
        const totalMemberSessions = enrichedMemberSessions.length
        const totalGuestSessions = guestSessions.length
        const totalMemberMessages = enrichedMemberSessions.reduce((sum, s) => sum + (s.message_count || 0), 0)
        const totalGuestMessages = guestLogs?.length || 0
        const uniqueMembers = new Set(enrichedMemberSessions.map(s => s.user_id).filter(Boolean)).size
        const uniqueGuests = new Set(guestSessions.map(s => s.visitor_id).filter(Boolean)).size

        return NextResponse.json({
            mentor,
            memberSessions: enrichedMemberSessions,
            guestSessions,
            stats: {
                totalMemberSessions,
                totalGuestSessions,
                totalMemberMessages,
                totalGuestMessages,
                uniqueMembers,
                uniqueGuests,
            },
        })
    } catch (error) {
        console.error('Admin mentor detail error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
