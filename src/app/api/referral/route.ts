import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function getDb() {
    try {
        return createAdminClient()
    } catch {
        return null
    }
}

// POST: referral_code 생성 (없는 경우)
export async function POST() {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (!user || authError) {
            return new Response(JSON.stringify({ error: '인증이 필요합니다' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const db = getDb() || supabase

        // 기존 코드 확인
        const { data: profile } = await db
            .from('users')
            .select('referral_code')
            .eq('id', user.id)
            .single()

        if (profile?.referral_code) {
            return new Response(JSON.stringify({ referral_code: profile.referral_code }), {
                headers: { 'Content-Type': 'application/json' },
            })
        }

        // UUID 기반 결정적 코드: UUID 앞 8자 (하이픈 제거, 대문자)
        // 같은 유저는 항상 같은 코드 → 영구적이고 식별 가능
        const code = user.id.replace(/-/g, '').slice(0, 8).toUpperCase()

        const { error } = await db
            .from('users')
            .update({ referral_code: code })
            .eq('id', user.id)

        if (error) {
            console.error('[Referral POST] update error:', error)
            return new Response(JSON.stringify({ error: '코드 생성 실패' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        return new Response(JSON.stringify({ referral_code: code }), {
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('[Referral POST] error:', error)
        return new Response(JSON.stringify({ error: '서버 오류' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }
}

// GET: 내 추천 현황 조회 (몇 명 가입, 적립 클로버)
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (!user || authError) {
            return new Response(JSON.stringify({ error: '인증이 필요합니다' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const db = getDb() || supabase

        // 내 referral_code 가져오기
        const { data: profile } = await db
            .from('users')
            .select('referral_code, clovers')
            .eq('id', user.id)
            .single()

        if (!profile?.referral_code) {
            return new Response(JSON.stringify({
                referral_code: null,
                friends_invited: 0,
                clovers_earned: 0,
                clovers: 0,
            }), {
                headers: { 'Content-Type': 'application/json' },
            })
        }

        // 내 코드로 가입한 유저 수
        const { count } = await db
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('referred_by', profile.referral_code)

        return new Response(JSON.stringify({
            referral_code: profile.referral_code,
            friends_invited: count || 0,
            clovers_earned: (count || 0) * 100,
            clovers: profile.clovers || 0,
        }), {
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('[Referral GET] error:', error)
        return new Response(JSON.stringify({ error: '서버 오류' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }
}
