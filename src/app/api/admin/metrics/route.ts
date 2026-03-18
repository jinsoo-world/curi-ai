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
        const today = new Date().toISOString().split('T')[0]
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
        const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]
        const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

        // === 핵심 지표 ===
        const { count: totalUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })

        const { count: newUsersToday } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today)

        const { count: newUsersYesterday } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', yesterday)
            .lt('created_at', today)

        const { count: newUsersThisWeek } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', weekAgo)

        const { count: newUsersLastWeek } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', twoWeeksAgo)
            .lt('created_at', weekAgo)

        const { count: totalSessions } = await supabase
            .from('chat_sessions')
            .select('*', { count: 'exact', head: true })

        const { count: totalMessages } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })

        const { count: todayMessages } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today)

        // WAU
        const { data: wauData } = await supabase
            .from('chat_sessions')
            .select('user_id')
            .gte('last_message_at', weekAgo)
        const wau = new Set(wauData?.map(d => d.user_id).filter(Boolean)).size

        // 지난주 WAU (비교용)
        const { data: lastWauData } = await supabase
            .from('chat_sessions')
            .select('user_id')
            .gte('last_message_at', twoWeeksAgo)
            .lt('last_message_at', weekAgo)
        const lastWau = new Set(lastWauData?.map(d => d.user_id).filter(Boolean)).size

        // === 세션당 평균 메시지 ===
        const { data: avgMsgData } = await supabase
            .from('chat_sessions')
            .select('message_count')
            .gt('message_count', 0)
        const avgMessagesPerSession = avgMsgData?.length
            ? (avgMsgData.reduce((sum, s) => sum + (s.message_count || 0), 0) / avgMsgData.length).toFixed(1)
            : '0'

        // === 구독 유저 수 ===
        const { count: activeSubscriptions } = await supabase
            .from('subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active')

        // === 비회원(게스트) 대화 수 — guest_chat_logs 테이블 기준 ===
        const { data: guestLogs } = await supabase
            .from('guest_chat_logs')
            .select('visitor_id')
            .gte('created_at', today)
        const guestVisitorSet = new Set(guestLogs?.map(l => l.visitor_id).filter(Boolean) || [])
        const guestSessions = guestLogs?.length || 0
        const guestUniqueVisitors = guestVisitorSet.size

        // === 오늘 생성된 AI(멘토) 수 ===
        const { count: todayMentors } = await supabase
            .from('mentors')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today)

        const { count: totalMentors } = await supabase
            .from('mentors')
            .select('*', { count: 'exact', head: true })

        // === 유저 가입 추이 (최근 30일) ===
        const { data: signupData } = await supabase
            .from('users')
            .select('created_at')
            .gte('created_at', monthAgo)
            .order('created_at', { ascending: true })

        const signupsByDay: Record<string, number> = {}
        signupData?.forEach(u => {
            const day = new Date(u.created_at).toISOString().split('T')[0]
            signupsByDay[day] = (signupsByDay[day] || 0) + 1
        })
        const signupTrend = Object.entries(signupsByDay).map(([date, count]) => ({ date, count }))

        // === 시간대별 메시지 분포 (이번 주) ===
        const { data: hourlyData } = await supabase
            .from('messages')
            .select('created_at')
            .gte('created_at', weekAgo)
            .eq('role', 'user')

        const hourlyDist = Array(24).fill(0)
        hourlyData?.forEach(m => {
            const hour = new Date(m.created_at).getHours()
            hourlyDist[hour]++
        })

        // === auth provider 분포 ===
        const authProviders: Record<string, number> = {}
        let authPage = 1
        let hasMore = true
        while (hasMore) {
            const { data: { users: authUserList } } = await supabase.auth.admin.listUsers({
                page: authPage,
                perPage: 1000,
            })
            if (!authUserList || authUserList.length === 0) {
                hasMore = false
            } else {
                authUserList.forEach(u => {
                    const p = u.app_metadata?.provider || u.app_metadata?.providers?.[0] || 'unknown'
                    authProviders[p] = (authProviders[p] || 0) + 1
                })
                if (authUserList.length < 1000) hasMore = false
                authPage++
            }
        }

        // === 대화 품질 신호 (최근 7일) ===
        const { data: signalData } = await supabase
            .from('conversation_signals')
            .select('signal_type')
            .gte('created_at', weekAgo)

        const signalCounts: Record<string, number> = {
            re_question: 0,
            early_exit: 0,
            long_session: 0,
            negative_feedback: 0,
            topic_gap: 0,
        }
        signalData?.forEach(s => {
            if (s.signal_type in signalCounts) {
                signalCounts[s.signal_type]++
            }
        })

        // === 오늘의 인사이트 ===
        const insights: Array<{ emoji: string; text: string }> = []

        // 1) 헤비 유저 (오늘 메시지 10개 이상)
        const { data: heavyUsers } = await supabase
            .from('chat_sessions')
            .select('user_id, message_count, users!inner(display_name)')
            .gte('last_message_at', today)
            .gt('message_count', 10)
            .order('message_count', { ascending: false })
            .limit(3)
        if (heavyUsers && heavyUsers.length > 0) {
            const names = heavyUsers.map((h: Record<string, unknown>) => {
                const user = h.users as Record<string, unknown> | null
                const name = user?.display_name || '알 수 없음'
                return `${name}(${h.message_count}회)`
            }).join(', ')
            insights.push({ emoji: '🔥', text: `오늘 열정 유저: ${names}` })
        }

        // 2) 신규 가입 후 바로 대화한 유저
        const { data: quickStarters } = await supabase
            .from('users')
            .select('display_name, created_at')
            .gte('created_at', today)
        if (quickStarters && quickStarters.length > 0) {
            insights.push({ emoji: '🌱', text: `오늘 신규 가입 ${quickStarters.length}명 — 환영합니다!` })
        }

        // 3) 오늘 대화가 활발한 시간대
        const peakHour = hourlyDist.indexOf(Math.max(...hourlyDist))
        const peakVal = Math.max(...hourlyDist)
        if (peakVal > 0) {
            insights.push({ emoji: '⏰', text: `오늘 피크: ${peakHour}시 (${peakVal}건 메시지)` })
        }

        // 4) 비회원 전환 포텐셜
        if ((guestSessions || 0) > 0) {
            insights.push({ emoji: '👋', text: `비회원 ${guestSessions}개 세션 — 전환 가능성 있는 잠재 유저` })
        }

        // 기본 인사이트
        if (insights.length === 0) {
            insights.push({ emoji: '✨', text: '오늘은 아직 특별한 인사이트가 없어요. 대화가 더 쌓이면 자동 분석됩니다.' })
        }

        // === 성장률 계산 ===
        const weeklyGrowth = lastWau > 0 ? (((wau - lastWau) / lastWau) * 100).toFixed(1) : '—'
        const userGrowth = (newUsersLastWeek || 0) > 0
            ? ((((newUsersThisWeek || 0) - (newUsersLastWeek || 0)) / (newUsersLastWeek || 1)) * 100).toFixed(1)
            : '—'

        return NextResponse.json({
            overview: {
                totalUsers: totalUsers || 0,
                newUsersToday: newUsersToday || 0,
                newUsersYesterday: newUsersYesterday || 0,
                newUsersThisWeek: newUsersThisWeek || 0,
                totalSessions: totalSessions || 0,
                totalMessages: totalMessages || 0,
                todayMessages: todayMessages || 0,
                wau,
                lastWau,
                weeklyGrowth,
                userGrowth,
                avgMessagesPerSession,
                activeSubscriptions: activeSubscriptions || 0,
                guestSessions: guestSessions || 0,
                todayMentors: todayMentors || 0,
                totalMentors: totalMentors || 0,
            },
            signupTrend,
            hourlyDistribution: hourlyDist,
            authProviders,
            signalCounts,
            insights,
        })
    } catch (error) {
        console.error('Admin metrics error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
