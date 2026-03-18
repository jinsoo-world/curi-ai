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
        // 유저 기본 정보 조회 (users 테이블)
        let query = supabase
            .from('users')
            .select('id, email, display_name, avatar_url, membership_tier, created_at, phone, gender, marketing_agreed, marketing_consent, subscription_tier, clovers, birth_year, referral_code', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + pageSize - 1)

        if (search) {
            query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`)
        }

        const { data: rawUsers, count: totalCount, error } = await query

        if (error) throw error

        // Supabase Auth Admin API로 실제 provider 조회
        const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({
            page: page,
            perPage: 1000,
        })

        // auth user id → provider 매핑
        const providerMap = new Map<string, string>()
        authUsers?.forEach(u => {
            const provider = u.app_metadata?.provider || u.app_metadata?.providers?.[0] || 'unknown'
            providerMap.set(u.id, provider)
        })

        // 유저별 세션/메시지 통계 추가
        const enrichedUsers = await Promise.all(
            (rawUsers || []).map(async (user) => {
                // 세션 수 + 총 메시지 수 (chat_sessions의 message_count 합산)
                const { data: sessions } = await supabase
                    .from('chat_sessions')
                    .select('id, message_count, last_message_at, created_at')
                    .eq('user_id', user.id)

                const totalSessions = sessions?.length || 0
                const totalMessages = sessions?.reduce((sum, s) => sum + (s.message_count || 0), 0) || 0
                const lastActive = sessions
                    ?.filter(s => s.last_message_at)
                    ?.sort((a, b) => new Date(b.last_message_at!).getTime() - new Date(a.last_message_at!).getTime())
                    ?.[0]?.last_message_at || null

                // 만든 AI 수
                const { count: aiCount } = await supabase
                    .from('mentors')
                    .select('id', { count: 'exact', head: true })
                    .eq('creator_id', user.id)

                // 누적 출석일수 (고유 활동 날짜 수, KST 기준)
                const activeDates = new Set<string>()
                sessions?.forEach(s => {
                    if (s.created_at) {
                        const d = new Date(s.created_at)
                        activeDates.add(d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }))
                    }
                    if (s.last_message_at) {
                        const d = new Date(s.last_message_at)
                        activeDates.add(d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }))
                    }
                })
                const attendanceDays = activeDates.size

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

                // 실제 auth provider 조회
                const authProvider = providerMap.get(user.id) || 'unknown'

                // display_name 폴백: null이면 이메일 앞부분 사용
                const displayName = user.display_name
                    || (user.email ? user.email.split('@')[0] : null)
                    || '(이름 없음)'

                // marketing 동의: marketing_consent 또는 marketing_agreed 중 하나 사용
                const marketingConsent = (user as Record<string, unknown>).marketing_consent
                    ?? (user as Record<string, unknown>).marketing_agreed
                    ?? null

                return {
                    id: user.id,
                    email: user.email,
                    display_name: displayName,
                    avatar_url: user.avatar_url,
                    membership_tier: user.membership_tier,
                    created_at: user.created_at,
                    auth_provider: authProvider,
                    total_sessions: totalSessions,
                    total_messages: totalMessages,
                    last_active_at: lastActive,
                    segment: userSegment,
                    phone: (user as Record<string, unknown>).phone || null,
                    gender: (user as Record<string, unknown>).gender || null,
                    birth_year: (user as Record<string, unknown>).birth_year || null,
                    marketing_consent: marketingConsent,
                    subscription_tier: (user as Record<string, unknown>).subscription_tier || null,
                    created_ai_count: aiCount || 0,
                    clovers: (user as Record<string, unknown>).clovers || 0,
                    attendance_days: attendanceDays,
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
