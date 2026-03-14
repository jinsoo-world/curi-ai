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

        const { count: activeSessions } = await supabase
            .from('chat_sessions')
            .select('*', { count: 'exact', head: true })
            .gte('last_message_at', today)

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

        // === 일별 추이 (최근 30일) ===
        const { data: dailyStats } = await supabase
            .from('mv_daily_stats')
            .select('*')
            .order('date', { ascending: true })
            .limit(30)

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

        // === 세션당 평균 메시지 ===
        const { data: avgMsgData } = await supabase
            .from('chat_sessions')
            .select('message_count')
            .gt('message_count', 0)
        const avgMessagesPerSession = avgMsgData?.length
            ? (avgMsgData.reduce((sum, s) => sum + (s.message_count || 0), 0) / avgMsgData.length).toFixed(1)
            : '0'

        // === 시간대별 메시지 분포 (오늘) ===
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

        // === 멘토별 대화 비율 ===
        const { data: mentorShareData } = await supabase
            .from('mv_mentor_stats')
            .select('mentor_name, total_sessions')

        // === auth provider 분포 ===
        const { data: providerData } = await supabase
            .from('users')
            .select('auth_provider')

        const authProviders: Record<string, number> = {}
        providerData?.forEach(u => {
            const p = u.auth_provider || 'unknown'
            authProviders[p] = (authProviders[p] || 0) + 1
        })

        // === 마케팅 수신 동의 통계 ===
        const { count: marketingConsentCount } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('marketing_consent', true)

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
                activeSessions: activeSessions || 0,
                totalMessages: totalMessages || 0,
                todayMessages: todayMessages || 0,
                wau,
                lastWau,
                weeklyGrowth,
                userGrowth,
                avgMessagesPerSession,
                marketingConsentCount: marketingConsentCount || 0,
                marketingConsentRate: (totalUsers || 0) > 0
                    ? (((marketingConsentCount || 0) / (totalUsers || 1)) * 100).toFixed(1)
                    : '0',
            },
            dailyStats: dailyStats || [],
            signupTrend,
            hourlyDistribution: hourlyDist,
            mentorShare: mentorShareData || [],
            authProviders,
        })
    } catch (error) {
        console.error('Admin metrics error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
