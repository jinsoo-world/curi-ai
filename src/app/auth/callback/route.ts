import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/mentors'

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            const {
                data: { user },
            } = await supabase.auth.getUser()

            if (user) {
                // Admin 클라이언트 사용 (RLS 우회)
                let db = supabase
                const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
                if (serviceKey && supabaseUrl) {
                    const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
                    db = createSupabaseClient(supabaseUrl, serviceKey, {
                        auth: { autoRefreshToken: false, persistSession: false },
                    })
                }

                // 기존 프로필 확인
                const { data: profile, error: profileError } = await db
                    .from('users')
                    .select('onboarding_completed, display_name, avatar_url, phone, gender, birth_year')
                    .eq('id', user.id)
                    .single()

                if (profileError) {
                    console.log('[Auth Callback] Profile lookup:', profileError.code, profileError.message)
                }

                if (!profile) {
                    // 첫 로그인: Google 프로필로 users 레코드 생성
                    const googleName = user.user_metadata?.full_name || user.user_metadata?.name || null
                    const googleAvatar = user.user_metadata?.avatar_url || null

                    const { error: insertError } = await db.from('users').upsert({
                        id: user.id,
                        email: user.email,
                        display_name: googleName,
                        avatar_url: googleAvatar,
                        onboarding_completed: false,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'id' })

                    if (insertError) {
                        console.error('[Auth Callback] User create error:', JSON.stringify(insertError))
                    }

                    // 신규 유저 → 멘토 페이지
                    return NextResponse.redirect(`${origin}/mentors`)
                }

                // 프로필 있지만 avatar_url이 없으면 Google 아바타 업데이트
                if (!profile.avatar_url && user.user_metadata?.avatar_url) {
                    await db.from('users').update({
                        avatar_url: user.user_metadata.avatar_url,
                    }).eq('id', user.id)
                }

                // 크레딧 미수령 유저 → 멘토 페이지
                if (!profile.phone) {
                    return NextResponse.redirect(`${origin}/mentors`)
                }

                // 기존 유저 재로그인 → 멘토 페이지
                return NextResponse.redirect(`${origin}/mentors`)
            }

            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // 에러 시 로그인 페이지로
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
