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
                    // 첫 로그인: OAuth 프로필로 users 레코드 생성
                    const provider = user.app_metadata?.provider || 'unknown'
                    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.nickname || null
                    const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || user.user_metadata?.profile_image_url || null

                    // 초대 코드 확인 (미들웨어에서 쿠키에 저장됨)
                    const { cookies } = await import('next/headers')
                    const cookieStore = await cookies()
                    const refCode = cookieStore.get('curi_ref')?.value || null

                    // Kakao 추가 정보 추출 (phone, gender 등)
                    const kakaoPhone = user.user_metadata?.phone_number
                        ? user.user_metadata.phone_number.replace(/[^0-9]/g, '').replace(/^82/, '0')
                        : null
                    const kakaoGender = user.user_metadata?.gender || null  // 'male' | 'female'

                    const { error: insertError } = await db.from('users').upsert({
                        id: user.id,
                        email: user.email,
                        display_name: displayName,
                        avatar_url: avatarUrl,
                        auth_provider: provider,
                        onboarding_completed: false,
                        referred_by: refCode,
                        ...(kakaoPhone ? { phone: kakaoPhone } : {}),
                        ...(kakaoGender ? { gender: kakaoGender === 'male' ? '남성' : kakaoGender === 'female' ? '여성' : null } : {}),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'id' })

                    if (insertError) {
                        console.error('[Auth Callback] User create error:', JSON.stringify(insertError))
                    }

                    // 추천인에게 100 클로버 지급
                    if (refCode) {
                        try {
                            // 추천인 찾기 (referral_code가 refCode인 유저)
                            const { data: referrer } = await db
                                .from('users')
                                .select('id, clovers')
                                .eq('referral_code', refCode)
                                .single()

                            if (referrer) {
                                await db.from('users')
                                    .update({ clovers: (referrer.clovers || 0) + 100 })
                                    .eq('id', referrer.id)

                                // 클로버 적립 기록
                                await db.from('credits').insert({
                                    user_id: referrer.id,
                                    amount: 100,
                                    type: 'referral_invite',
                                    description: `${displayName || user.email || '새 유저'} 님이 초대로 가입`,
                                })
                                console.log(`[Auth Callback] Referrer ${referrer.id} got 100 clovers for invite`)
                            }
                        } catch (refErr) {
                            console.error('[Auth Callback] Referral reward error:', refErr)
                        }

                        // 쿠키 소비 (삭제)
                        const response = NextResponse.redirect(`${origin}/mentors?new_user=true`)
                        response.cookies.delete('curi_ref')
                        return response
                    }

                    // 신규 유저 → 멘토 페이지 (new_user 플래그로 모달 자동 팝업)
                    return NextResponse.redirect(`${origin}/mentors?new_user=true`)
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
