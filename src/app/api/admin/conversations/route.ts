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
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

        // ── 일별 통계: chat_sessions + messages에서 직접 계산 ──
        const { data: sessions } = await supabase
            .from('chat_sessions')
            .select('id, user_id, message_count, created_at, last_message_at')
            .gte('created_at', thirtyDaysAgo)

        const { data: messages } = await supabase
            .from('messages')
            .select('id, session_id, role, input_method, created_at')
            .gte('created_at', thirtyDaysAgo)

        // 일별 집계
        const dailyMap: Record<string, {
            date: string
            total_sessions: number
            total_messages: number
            user_messages: number
            assistant_messages: number
            stt_messages: number
            active_users: Set<string>
        }> = {}

        const getDate = (d: string) => d?.slice(0, 10) || ''

        sessions?.forEach(s => {
            const date = getDate(s.created_at)
            if (!date) return
            if (!dailyMap[date]) {
                dailyMap[date] = {
                    date, total_sessions: 0, total_messages: 0,
                    user_messages: 0, assistant_messages: 0, stt_messages: 0,
                    active_users: new Set(),
                }
            }
            dailyMap[date].total_sessions++
            if (s.user_id) dailyMap[date].active_users.add(s.user_id)
        })

        messages?.forEach(m => {
            const date = getDate(m.created_at)
            if (!date || !dailyMap[date]) {
                // 메시지 날짜에 해당하는 세션이 없으면 생성
                if (date && !dailyMap[date]) {
                    dailyMap[date] = {
                        date, total_sessions: 0, total_messages: 0,
                        user_messages: 0, assistant_messages: 0, stt_messages: 0,
                        active_users: new Set(),
                    }
                }
                if (!date) return
            }
            dailyMap[date].total_messages++
            if (m.role === 'user') dailyMap[date].user_messages++
            if (m.role === 'assistant') dailyMap[date].assistant_messages++
            if (m.input_method === 'stt') dailyMap[date].stt_messages++
        })

        const dailyStats = Object.values(dailyMap)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(d => ({
                ...d,
                active_users: d.active_users.size,
            }))

        // ── 최근 대화 세션 (메시지 1개 이상) ──
        const { data: recentSessions } = await supabase
            .from('chat_sessions')
            .select('id, user_id, mentor_id, message_count, last_message_at, created_at')
            .gt('message_count', 0)
            .order('last_message_at', { ascending: false })
            .limit(30)

        // 멘토/유저 이름 매핑
        const mentorIds = [...new Set(recentSessions?.map(s => s.mentor_id).filter(Boolean) || [])]
        const userIds = [...new Set(recentSessions?.map(s => s.user_id).filter(Boolean) || [])]

        let mentorMap: Record<string, string> = {}
        if (mentorIds.length > 0) {
            const { data: mentors } = await supabase
                .from('mentors')
                .select('id, name')
                .in('id', mentorIds)
            mentors?.forEach(m => { mentorMap[m.id] = m.name })
        }

        let userMap: Record<string, { name: string; email: string }> = {}
        if (userIds.length > 0) {
            const { data: users } = await supabase
                .from('users')
                .select('id, email, display_name')
                .in('id', userIds)
            users?.forEach(u => {
                userMap[u.id] = {
                    name: u.display_name || u.email?.split('@')[0] || '',
                    email: u.email || '',
                }
            })
        }

        const enrichedSessions = recentSessions?.map(s => ({
            id: s.id,
            mentor_name: mentorMap[s.mentor_id] || '알 수 없음',
            user_name: userMap[s.user_id]?.name || '비회원',
            user_email: userMap[s.user_id]?.email || '',
            message_count: s.message_count || 0,
            created_at: s.created_at,
            last_message_at: s.last_message_at,
        })) || []

        // ── 입력 방식 비율 (최근 7일) ──
        const { count: textCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'user')
            .gte('created_at', weekAgo)
            .or('input_method.eq.text,input_method.is.null')

        const { count: sttCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'user')
            .eq('input_method', 'stt')
            .gte('created_at', weekAgo)

        return NextResponse.json({
            dailyStats,
            recentSessions: enrichedSessions,
            inputRatio: {
                text: textCount || 0,
                stt: sttCount || 0,
            },
        })
    } catch (error) {
        console.error('Admin conversations error:', error)
        return NextResponse.json({
            dailyStats: [],
            recentSessions: [],
            inputRatio: { text: 0, stt: 0 },
        })
    }
}
