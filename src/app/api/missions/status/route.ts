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

        // 1) AI 몇 개 만들었는지 (creator_profiles → mentors)
        const { data: creatorProfile } = await supabaseAdmin
            .from('creator_profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle()

        let aiCreated = 0
        if (creatorProfile) {
            const { count } = await supabaseAdmin
                .from('mentors')
                .select('*', { count: 'exact', head: true })
                .eq('creator_id', creatorProfile.id)
            aiCreated = count || 0
        }

        // 2) 질문 횟수 (user role 메시지)
        const { data: sessions } = await supabaseAdmin
            .from('chat_sessions')
            .select('id')
            .eq('user_id', user.id)

        let questionsAsked = 0
        if (sessions && sessions.length > 0) {
            const { count } = await supabaseAdmin
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'user')
                .in('session_id', sessions.map(s => s.id))
            questionsAsked = count || 0
        }

        // 3) 프로필
        const { data: profile } = await supabaseAdmin
            .from('users')
            .select('clovers, referral_code')
            .eq('id', user.id)
            .single()

        // 4) 친구 초대 수
        let friendsInvited = 0
        if (profile?.referral_code) {
            const { count } = await supabaseAdmin
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('referred_by', profile.referral_code)
            friendsInvited = count || 0
        }

        // ── credits 테이블 존재 여부 체크 ──
        let creditsTableExists = true
        const { error: creditsCheckError } = await supabaseAdmin
            .from('credits')
            .select('id')
            .limit(0)
        if (creditsCheckError) {
            console.warn('[Credits] Table check failed:', creditsCheckError.message)
            creditsTableExists = false
        }

        let sharesToday = 0
        let creditHistory: { type: string; amount: number; description: string; created_at: string }[] = []
        let finalClovers = profile?.clovers || 0

        if (creditsTableExists) {
            // 오늘 공유 횟수
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const { data: todayShareData } = await supabaseAdmin
                .from('credits')
                .select('id')
                .eq('user_id', user.id)
                .eq('type', 'mission_share')
                .gte('created_at', today.toISOString())
            sharesToday = todayShareData?.length || 0

            // 클로버 이력
            const { data: historyData } = await supabaseAdmin
                .from('credits')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(20)
            creditHistory = historyData || []

            // 기존 적립 타입
            const existingTypes = creditHistory.map((c: { type: string }) => c.type)

            // ── 자동 적립 ──
            const newCredits: { type: string; amount: number; description: string }[] = []

            // AI 만들기 미션 (2개 이상 → 50 클로버)
            if ((aiCreated || 0) >= 2 && !existingTypes.includes('mission_create_ai')) {
                newCredits.push({ type: 'mission_create_ai', amount: 50, description: '미션 완료: AI 2개 만들기' })
            }

            // 질문 10번 미션 (30 클로버)
            if (questionsAsked >= 10 && !existingTypes.includes('mission_ask_10')) {
                newCredits.push({ type: 'mission_ask_10', amount: 30, description: '미션 완료: 10번 질문하기' })
            }

            // 친구 초대 미션 (100 클로버)
            if (friendsInvited >= 1 && !existingTypes.includes('mission_invite')) {
                newCredits.push({ type: 'mission_invite', amount: 100, description: `미션 완료: 친구 ${friendsInvited}명 초대` })
            }

            // 일괄 적립
            for (const credit of newCredits) {
                const { error: insertErr } = await supabaseAdmin.from('credits').insert({
                    user_id: user.id,
                    ...credit,
                })
                if (insertErr) {
                    console.error(`[Credits] ${credit.type} insert failed:`, insertErr.message, insertErr.code, insertErr.details)
                }
            }

            // 적립 후 잔액 재계산
            const { data: finalBalance } = await supabaseAdmin
                .from('credits')
                .select('amount')
                .eq('user_id', user.id)
            finalClovers = (finalBalance || []).reduce((s: number, r: { amount: number }) => s + r.amount, 0)

            // 이력 다시 조회
            const { data: updatedHistory } = await supabaseAdmin
                .from('credits')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(20)
            creditHistory = updatedHistory || []

            // users.clovers 동기화
            await supabaseAdmin.from('users').update({ clovers: finalClovers }).eq('id', user.id)

        } else {
            // ── credits 테이블 없음 → users.clovers 직접 적립 (fallback) ──
            console.warn('[Credits] Fallback: using users.clovers directly')
            
            let totalEarned = 0

            // AI 만들기 미션
            if ((aiCreated || 0) >= 2) totalEarned += 50
            // 질문 10번 미션
            if (questionsAsked >= 10) totalEarned += 30
            // 친구 초대 미션
            if (friendsInvited >= 1) totalEarned += 100

            if (totalEarned > 0 && (profile?.clovers || 0) < totalEarned) {
                finalClovers = totalEarned
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
        })
    } catch (err: unknown) {
        console.error('Mission status error:', err)
        return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
    }
}
