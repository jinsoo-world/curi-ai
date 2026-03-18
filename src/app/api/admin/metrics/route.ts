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
            },
            signupTrend,
            hourlyDistribution: hourlyDist,
            authProviders,
            signalCounts,
        })
    } catch (error) {
        console.error('Admin metrics error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
