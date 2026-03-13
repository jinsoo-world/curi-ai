import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createBrowserClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
    try {
        const supabase = await createBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        // ── 1차 병렬 조회: 독립된 3개 쿼리를 동시 실행 ──
        const [creatorResult, sessionsResult, profileResult, creditsCheckResult] = await Promise.all([
            // 크리에이터 프로필
            supabaseAdmin.from('creator_profiles').select('id').eq('user_id', user.id).maybeSingle(),
            // 채팅 세션 ID 목록
            supabaseAdmin.from('chat_sessions').select('id').eq('user_id', user.id),
            // 유저 프로필
            supabaseAdmin.from('users').select('clovers, referral_code, phone, gender, marketing_consent').eq('id', user.id).single(),
            // credits 테이블 체크
            supabaseAdmin.from('credits').select('id').limit(0),
        ])

        const creatorProfile = creatorResult.data
        const sessions = sessionsResult.data
        const profile = profileResult.data
        const creditsTableExists = !creditsCheckResult.error

        // ── 2차 병렬 조회: 1차 결과에 의존하는 쿼리들 ──
        const secondaryQueries: Promise<any>[] = []

        // AI 생성 수 (creator_profiles 결과 사용)
        const aiCreatedPromise = (async () => {
            let aiCreated = 0
            if (creatorProfile) {
                const { count } = await supabaseAdmin
                    .from('mentors')
                    .select('*', { count: 'exact', head: true })
                    .eq('creator_id', creatorProfile.id)
                aiCreated = count || 0
            }
            if (aiCreated === 0) {
                const { count: directCount } = await supabaseAdmin
                    .from('mentors')
                    .select('*', { count: 'exact', head: true })
                    .eq('creator_id', user.id)
                if ((directCount || 0) > aiCreated) aiCreated = directCount || 0
            }
            return aiCreated
        })()
        secondaryQueries.push(aiCreatedPromise)

        // 질문 횟수 (sessions 결과 사용)
        const questionsPromise = (async () => {
            if (sessions && sessions.length > 0) {
                const { count } = await supabaseAdmin
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('role', 'user')
                    .in('session_id', sessions.map(s => s.id))
                return count || 0
            }
            return 0
        })()
        secondaryQueries.push(questionsPromise)

        // 친구 초대 수 (profile 결과 사용)
        const friendsPromise = (async () => {
            if (profile?.referral_code) {
                const { count } = await supabaseAdmin
                    .from('users')
                    .select('*', { count: 'exact', head: true })
                    .eq('referred_by', profile.referral_code)
                return count || 0
            }
            return 0
        })()
        secondaryQueries.push(friendsPromise)

        // credits 관련 쿼리 (creditsTableExists 결과 사용)
        const creditsPromise = (async () => {
            if (!creditsTableExists) return { sharesToday: 0, creditHistory: [] as any[], cloverHuntToday: 0 }

            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const [shareResult, historyResult, cloverHuntResult] = await Promise.all([
                supabaseAdmin.from('credits').select('id').eq('user_id', user.id).eq('type', 'mission_share').gte('created_at', today.toISOString()),
                supabaseAdmin.from('credits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
                supabaseAdmin.from('credit_transactions').select('id').eq('user_id', user.id).eq('type', 'clover_hunt').gte('created_at', today.toISOString()),
            ])

            return {
                sharesToday: shareResult.data?.length || 0,
                creditHistory: historyResult.data || [],
                cloverHuntToday: cloverHuntResult.data?.length || 0,
            }
        })()
        secondaryQueries.push(creditsPromise)

        // 2차 쿼리 모두 동시 실행
        const [aiCreated, questionsAsked, friendsInvited, creditsData] = await Promise.all(secondaryQueries)

        const profileUpdated = !!(profile?.phone || profile?.gender)
        let { sharesToday, creditHistory, cloverHuntToday } = creditsData
        let finalClovers = profile?.clovers || 0

        if (creditsTableExists) {
            const existingTypes = creditHistory.map((c: { type: string }) => c.type)

            // ── 자동 적립 ──
            const newCredits: { type: string; amount: number; description: string }[] = []

            if ((aiCreated || 0) >= 1 && !existingTypes.includes('mission_create_ai_1')) {
                newCredits.push({ type: 'mission_create_ai_1', amount: 25, description: '미션 완료: AI 1개 만들기' })
            }
            if ((aiCreated || 0) >= 2 && !existingTypes.includes('mission_create_ai_2')) {
                newCredits.push({ type: 'mission_create_ai_2', amount: 25, description: '미션 완료: AI 2개 만들기' })
            }
            if (questionsAsked >= 10 && !existingTypes.includes('mission_ask_10')) {
                newCredits.push({ type: 'mission_ask_10', amount: 30, description: '미션 완료: 10번 질문하기' })
            }
            if (friendsInvited >= 1 && !existingTypes.includes('mission_invite')) {
                newCredits.push({ type: 'mission_invite', amount: 100, description: `미션 완료: 친구 ${friendsInvited}명 초대` })
            }
            if (profileUpdated && !existingTypes.includes('mission_profile_update')) {
                newCredits.push({ type: 'mission_profile_update', amount: 30, description: '미션 완료: 마이페이지 업데이트' })
            }

            // 일괄 적립 (병렬)
            if (newCredits.length > 0) {
                await Promise.all(
                    newCredits.map(credit =>
                        supabaseAdmin.from('credits').insert({ user_id: user.id, ...credit })
                    )
                )

                // 적립 후 잔액 재계산 + 이력 재조회 (병렬)
                const [balanceResult, updatedHistoryResult] = await Promise.all([
                    supabaseAdmin.from('credits').select('amount').eq('user_id', user.id),
                    supabaseAdmin.from('credits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
                ])

                finalClovers = (balanceResult.data || []).reduce((s: number, r: { amount: number }) => s + r.amount, 0)
                creditHistory = updatedHistoryResult.data || []

                // users.clovers 동기화
                await supabaseAdmin.from('users').update({ clovers: finalClovers }).eq('id', user.id)
            } else {
                // 적립 없어도 잔액 재계산 + users.clovers 동기화
                const { data: balanceData } = await supabaseAdmin.from('credits').select('amount').eq('user_id', user.id)
                finalClovers = (balanceData || []).reduce((s: number, r: { amount: number }) => s + r.amount, 0)

                // users.clovers가 다르면 동기화
                if (finalClovers !== (profile?.clovers || 0)) {
                    await supabaseAdmin.from('users').update({ clovers: finalClovers }).eq('id', user.id)
                }
            }
        } else {
            // ── credits 테이블 없음 → users.clovers 직접 적립 (fallback) ──
            let totalEarned = 0
            const now = new Date().toISOString()

            if ((aiCreated || 0) >= 1) {
                totalEarned += 25
                creditHistory.push({ type: 'mission_create_ai_1', amount: 25, description: '미션 완료: AI 1개 만들기', created_at: now })
            }
            if ((aiCreated || 0) >= 2) {
                totalEarned += 25
                creditHistory.push({ type: 'mission_create_ai_2', amount: 25, description: '미션 완료: AI 2개 만들기', created_at: now })
            }
            if (questionsAsked >= 10) {
                totalEarned += 30
                creditHistory.push({ type: 'mission_ask_10', amount: 30, description: '미션 완료: 10번 질문하기', created_at: now })
            }
            if (friendsInvited >= 1) {
                totalEarned += 100
                creditHistory.push({ type: 'mission_invite', amount: 100, description: `미션 완료: 친구 ${friendsInvited}명 초대`, created_at: now })
            }
            if (profileUpdated) {
                totalEarned += 30
                creditHistory.push({ type: 'mission_profile_update', amount: 30, description: '미션 완료: 마이페이지 업데이트', created_at: now })
            }

            finalClovers = totalEarned
            if (totalEarned > 0) {
                await supabaseAdmin.from('users').update({ clovers: finalClovers }).eq('id', user.id)
            }
        }

        return NextResponse.json({
            ok: true,
            aiCreated: aiCreated || 0,
            questionsAsked,
            clovers: finalClovers,
            referralCode: profile?.referral_code || '',
            friendsInvited,
            sharesToday,
            creditHistory,
            profileUpdated,
            cloverHuntToday,
        })
    } catch (err: unknown) {
        console.error('Mission status error:', err)
        return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
    }
}
