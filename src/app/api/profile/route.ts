import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveOnboardingProfile, updateUserProfile, getUserProfile } from '@/domains/user'

export const dynamic = 'force-dynamic'

function getDb() {
    try {
        return createAdminClient()
    } catch {
        return null
    }
}

// POST: 온보딩 데이터 저장
export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (!user || authError) {
            console.error('[Profile POST] Auth failed:', authError?.message || 'No user')
            return new Response(JSON.stringify({ error: '인증이 필요합니다', detail: authError?.message }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const body = await req.json()
        const db = getDb() || supabase

        // domains/user 호출
        await saveOnboardingProfile(
            db,
            user.id,
            user.email,
            body,
            user.user_metadata?.avatar_url,
        )



        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('[Profile POST] unexpected error:', error)
        return new Response(JSON.stringify({
            error: '서버 오류',
            detail: error instanceof Error ? error.message : String(error),
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }
}

// PATCH: 프로필 편집 저장
export async function PATCH(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (!user || authError) {
            return new Response(JSON.stringify({ error: '인증이 필요합니다' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const body = await req.json()
        const db = getDb() || supabase

        // domains/user 호출
        await updateUserProfile(db, user.id, body)

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('[Profile PATCH] error:', error)
        return new Response(JSON.stringify({
            error: '프로필 수정 실패',
            detail: error instanceof Error ? error.message : String(error),
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }
}

// GET: 프로필 조회
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

        // domains/user 호출
        const profile = await getUserProfile(db, user.id)

        // 🔄 daily_free_used 날짜 리셋 체크
        if (profile && profile.daily_free_used > 0) {
            const now = new Date()
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            const resetAt = profile.daily_free_reset_at ? new Date(profile.daily_free_reset_at) : null

            if (!resetAt || resetAt < todayStart) {
                // 날짜가 바뀌었으므로 카운트 리셋
                profile.daily_free_used = 0
                await db.from('users').update({
                    daily_free_used: 0,
                    daily_free_reset_at: now.toISOString(),
                }).eq('id', user.id)
            }
        }

        // 구독 정보도 함께 조회
        let subscriptionInfo = null
        try {
            const { data: sub } = await db
                .from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .in('status', ['active', 'canceled'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            if (sub) {
                subscriptionInfo = sub
            }
        } catch (e) {
            console.error('[Profile GET] subscription query error:', e)
        }

        return new Response(JSON.stringify({
            profile: profile || null,
            google_name: user.user_metadata?.full_name || null,
            google_avatar: user.user_metadata?.avatar_url || null,
            subscription: subscriptionInfo,
        }), {
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        return new Response(JSON.stringify({ error: '서버 오류' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }
}
