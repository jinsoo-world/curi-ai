import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
    const auth = await requireAdminAPI()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const supabase = createAdminClient()
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''
    const segment = searchParams.get('segment') || 'all'
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = 20
    const offset = (page - 1) * pageSize

    try {
        // 유저 기본 정보 조회 (users 테이블 - auth_provider 없음)
        let query = supabase
            .from('users')
            .select('id, email, display_name, avatar_url, membership_tier, created_at, phone, gender, marketing_agreed, subscription_tier', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + pageSize - 1)

        if (search) {
            query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`)
        }

        const { data: rawUsers, count: totalCount, error } = await query

        if (error) throw error

        // 유저별 세션/메시지 통계 추가
        const enrichedUsers = await Promise.all(
            (rawUsers || []).map(async (user) => {
                // 세션 수 + 총 메시지 수 (chat_sessions의 message_count 합산)
                const { data: sessions } = await supabase
                    .from('chat_sessions')
                    .select('id, message_count, last_message_at')
                    .eq('user_id', user.id)

                const totalSessions = sessions?.length || 0
                const totalMessages = sessions?.reduce((sum, s) => sum + (s.message_count || 0), 0) || 0
                const lastActive = sessions
                    ?.filter(s => s.last_message_at)
                    ?.sort((a, b) => new Date(b.last_message_at!).getTime() - new Date(a.last_message_at!).getTime())
                    ?.[0]?.last_message_at || null

                // 세그먼트 판단
                const daysSinceJoin = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000)
                const daysSinceActive = lastActive
                    ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000)
                    : daysSinceJoin

                let userSegment = 'new'
                if (daysSinceJoin <= 7) {
                    userSegment = 'new'
                } else if (daysSinceActive > 30) {
                    userSegment = 'churned'
                } else if (daysSinceActive > 14) {
                    userSegment = 'dormant'
                } else if (totalSessions >= 10) {
                    userSegment = 'heavy'
                } else {
                    userSegment = 'light'
                }

                return {
                    id: user.id,
                    email: user.email,
                    display_name: user.display_name,
                    avatar_url: user.avatar_url,
                    membership_tier: user.membership_tier,
                    created_at: user.created_at,
                    auth_provider: 'google',
                    total_sessions: totalSessions,
                    total_messages: totalMessages,
                    last_active_at: lastActive,
                    segment: userSegment,
                    phone: (user as Record<string, unknown>).phone || null,
                    gender: (user as Record<string, unknown>).gender || null,
                    marketing_agreed: (user as Record<string, unknown>).marketing_agreed ?? null,
                    subscription_tier: (user as Record<string, unknown>).subscription_tier || null,
                }
            })
        )

        // 세그먼트 필터링
        const filteredUsers = segment !== 'all'
            ? enrichedUsers.filter(u => u.segment === segment)
            : enrichedUsers

        // 세그먼트 집계
        const segments: Record<string, number> = { new: 0, light: 0, heavy: 0, dormant: 0, churned: 0 }
        enrichedUsers.forEach(u => {
            if (u.segment in segments) segments[u.segment]++
        })

        return NextResponse.json({
            users: filteredUsers,
            totalCount: totalCount || 0,
            page,
            pageSize,
            segments,
        })
    } catch (error) {
        console.error('Admin users error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
