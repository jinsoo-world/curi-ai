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

        return new Response(JSON.stringify({
            profile: profile || null,
            google_name: user.user_metadata?.full_name || null,
            google_avatar: user.user_metadata?.avatar_url || null,
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
