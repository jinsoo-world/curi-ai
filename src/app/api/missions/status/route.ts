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

        // ── 1차 병렬 조회 ──
        const [creatorResult, sessionsResult, profileResult] = await Promise.all([
            supabaseAdmin.from('creator_profiles').select('id').eq('user_id', user.id).maybeSingle(),
            supabaseAdmin.from('chat_sessions').select('id').eq('user_id', user.id),
            supabaseAdmin.from('users').select('clovers, credit_balance, referral_code, phone, gender, marketing_consent').eq('id', user.id).single(),
        ])

        const creatorProfile = creatorResult.data
        const sessions = sessionsResult.data
        let profile = profileResult.data

        // referral_code가 없는 유저에게 자동 생성
        if (profile && !profile.referral_code) {
            const newCode = `CURI${user.id.slice(0, 6).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`
            const { error: updateErr } = await supabaseAdmin
                .from('users')
                .update({ referral_code: newCode })
                .eq('id', user.id)
            if (!updateErr) {
                profile = { ...profile, referral_code: newCode }
                console.log(`[Mission] Auto-generated referral code for user ${user.id}: ${newCode}`)
            }
        }

        // ── 2차 병렬 조회 ──
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const [aiCreated, questionsAsked, friendsInvited, creditsData] = await Promise.all([
            // AI 생성 수
            (async () => {
                let count = 0
                if (creatorProfile) {
                    const { count: c } = await supabaseAdmin
                        .from('mentors')
                        .select('*', { count: 'exact', head: true })
                        .eq('creator_id', creatorProfile.id)
                    count = c || 0
                }
                if (count === 0) {
                    const { count: directCount } = await supabaseAdmin
                        .from('mentors')
                        .select('*', { count: 'exact', head: true })
                        .eq('creator_id', user.id)
                    if ((directCount || 0) > count) count = directCount || 0
                }
                return count
            })(),

            // 질문 횟수
            (async () => {
                if (sessions && sessions.length > 0) {
                    const { count } = await supabaseAdmin
                        .from('messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('role', 'user')
                        .in('session_id', sessions.map(s => s.id))
                    return count || 0
                }
                return 0
            })(),

            // 친구 초대 수
            (async () => {
                if (profile?.referral_code) {
                    const { count } = await supabaseAdmin
                        .from('users')
                        .select('*', { count: 'exact', head: true })
                        .eq('referred_by', profile.referral_code)
                    return count || 0
                }
                return 0
            })(),

            // credit_transactions 조회
            (async () => {
                const [shareResult, historyResult, cloverHuntResult, completedMissionsResult] = await Promise.all([
                    supabaseAdmin.from('credit_transactions')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('type', 'mission_share')
                        .gte('created_at', today.toISOString()),
                    supabaseAdmin.from('credit_transactions')
                        .select('*')
                        .eq('user_id', user.id)
                        .in('type', [
                            'clover_hunt', 'mission_share', 'referral_invite',
                            'mission_create_ai_1', 'mission_create_ai_2',
                            'mission_ask_10', 'mission_invite', 'mission_profile_update',
                        ])
                        .order('created_at', { ascending: false })
                        .limit(20),
                    supabaseAdmin.from('credit_transactions')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('type', 'clover_hunt')
                        .gte('created_at', today.toISOString()),
                    // 미션 완료 체크용: limit 없이 완료된 미션 타입만 조회 (중복 적립 방지)
                    supabaseAdmin.from('credit_transactions')
                        .select('type')
                        .eq('user_id', user.id)
                        .in('type', [
                            'mission_create_ai_1', 'mission_create_ai_2',
                            'mission_ask_10', 'mission_invite', 'mission_profile_update',
                        ]),
                ])

                return {
                    sharesToday: shareResult.data?.length || 0,
                    creditHistory: historyResult.data || [],
                    cloverHuntToday: cloverHuntResult.data?.length || 0,
                    completedMissions: completedMissionsResult.data || [],
                }
            })(),
        ])

        const profileUpdated = !!(profile?.phone || profile?.gender)
        let { sharesToday, creditHistory, cloverHuntToday, completedMissions } = creditsData
        let finalClovers = profile?.clovers || 0

        // ── 자동 미션 적립 (credit_transactions 테이블) ──
        // completedMissions (limit 없음)로 중복 체크 → 절대 중복 적립 안 됨
        const existingTypes = completedMissions.map((c: { type: string }) => c.type)
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
            newCredits.push({ type: 'mission_invite', amount: 10, description: `미션 완료: 친구 ${friendsInvited}명 초대` })
        }
        if (profileUpdated && !existingTypes.includes('mission_profile_update')) {
            newCredits.push({ type: 'mission_profile_update', amount: 30, description: '미션 완료: 마이페이지 업데이트' })
        }

        if (newCredits.length > 0) {
            // 새 적립 insert
            let runningBalance = finalClovers
            for (const credit of newCredits) {
                runningBalance += credit.amount
                await supabaseAdmin.from('credit_transactions').insert({
                    user_id: user.id,
                    amount: credit.amount,
                    balance_after: runningBalance,
                    type: credit.type,
                    description: credit.description,
                })
            }

            finalClovers = runningBalance

            // users 잔액 동기화
            await supabaseAdmin.from('users').update({
                clovers: finalClovers,
                credit_balance: finalClovers,
            }).eq('id', user.id)

            // 이력 재조회
            const { data: updatedHistory } = await supabaseAdmin
                .from('credit_transactions')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(20)
            creditHistory = updatedHistory || []
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
