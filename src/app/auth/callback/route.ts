import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SIGNUP_CLOVERS, REFERRER_REWARD } from '@/domains/trial'
import { safeNextPath } from '@/lib/safe-next'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // 로그인 뒤 돌아갈 주소. 우리 사이트 경로만 허용(//·http 로 시작하면 무시), 없으면 /mentors
    const next = safeNextPath(searchParams.get('next')) ?? '/mentors'
    // 새 회원 표시(new_user=true)를 next 주소에 붙인다. next 에 ? 가 이미 있어도 안전하게
    const withNewUser = (path: string) => {
        const u = new URL(path, origin)
        u.searchParams.set('new_user', 'true')
        return u.toString()
    }

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

                // 가입 선물 — 대표 확정 2026-09-15
                //
                // 🚨 2026-09-15 수리 = 이 블록이 원래 「users 행이 아직 없을 때」 안에만 있었다.
                // 그런데 Supabase 는 가입하는 순간 users 행을 먼저 만든다. 그래서 여기 도착했을 땐
                // 이미 행이 있고, 선물 블록을 통째로 건너뛰었다. 실제로 받은 사람이 한 명도 없었다
                // (대표 지적 「jin 구글 계정에는 왜 클로버가 0개임」).
                // 이제 프로필이 있든 없든 돈다. 두 번 주는 것은 credit_transactions 기록이 막는다.
                // 이미 가입한 분들도 다음 로그인 때 자동으로 받는다.
                try {
                    const { data: 이미받음 } = await db
                        .from('credit_transactions')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('type', 'signup_bonus')
                        .limit(1)

                    if (!이미받음?.length) {
                        const { data: 새잔액, error: 더하기오류 } = await db.rpc('클로버_더하기', {
                            그사람: user.id,
                            더할값: SIGNUP_CLOVERS,
                        })
                        if (더하기오류) {
                            console.error('[Auth Callback] 가입 선물 지급 실패:', 더하기오류.message)
                        } else {
                            await db.from('credit_transactions').insert({
                                user_id: user.id,
                                amount: SIGNUP_CLOVERS,
                                balance_after: 새잔액 ?? SIGNUP_CLOVERS,
                                type: 'signup_bonus',
                                description: '가입 선물',
                            })
                        }
                    }
                } catch (선물오류) {
                    // 선물에 실패해도 로그인은 막지 않는다
                    console.error('[Auth Callback] 가입 선물 실패:', 선물오류)
                }

                // 기존 프로필 확인
                const { data: profile, error: profileError } = await db
                    .from('users')
                    .select('onboarding_completed, display_name, avatar_url, phone, gender, birth_year, auth_provider')
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

                    // Kakao 추가 정보 추출 (phone, gender, birthyear 등)
                    const kakaoPhone = user.user_metadata?.phone_number
                        ? user.user_metadata.phone_number.replace(/[^0-9]/g, '').replace(/^82/, '0')
                        : null
                    const kakaoGender = user.user_metadata?.gender || null  // 'male' | 'female'
                    const kakaoBirthYear = user.user_metadata?.birthyear
                        ? parseInt(user.user_metadata.birthyear)
                        : null

                    const { error: insertError } = await db.from('users').upsert({
                        id: user.id,
                        email: user.email,
                        display_name: displayName,
                        avatar_url: avatarUrl,
                        auth_provider: provider,
                        onboarding_completed: true,
                        referred_by: refCode,
                        ...(kakaoPhone ? { phone: kakaoPhone } : {}),
                        ...(kakaoGender ? { gender: kakaoGender === 'male' ? '남성' : kakaoGender === 'female' ? '여성' : null } : {}),
                        ...(kakaoBirthYear ? { birth_year: kakaoBirthYear } : {}),
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
                                await db.rpc('클로버_더하기', { 그사람: referrer.id, 더할값: REFERRER_REWARD })

                                // 클로버 적립 기록
                                await db.from('credit_transactions').insert({
                                    user_id: referrer.id,
                                    amount: REFERRER_REWARD,
                                    balance_after: (referrer.clovers || 0) + REFERRER_REWARD,
                                    type: 'referral_invite',
                                    description: `${displayName || user.email || '새 유저'} 님이 초대로 가입`,
                                })
                                console.log(`[Auth Callback] Referrer ${referrer.id} got 100 clovers for invite`)
                            }
                        } catch (refErr) {
                            console.error('[Auth Callback] Referral reward error:', refErr)
                        }

                        // 쿠키 소비 (삭제)
                        const response = NextResponse.redirect(withNewUser(next))
                        response.cookies.delete('curi_ref')
                        return response
                    }

                    // 신규 유저 → next(기본 멘토 페이지). new_user 플래그로 모달 자동 팝업
                    return NextResponse.redirect(withNewUser(next))
                }

                // 기존 유저: 카카오 정보 업데이트 (전화번호, 성별, 출생연도, 아바타)
                const updates: Record<string, unknown> = {}

                // 아바타 업데이트
                if (!profile.avatar_url && user.user_metadata?.avatar_url) {
                    updates.avatar_url = user.user_metadata.avatar_url
                }

                // 카카오 추가 정보 (없으면 업데이트)
                const provider = user.app_metadata?.provider || 'unknown'
                if (provider === 'kakao') {
                    const kakaoPhone = user.user_metadata?.phone_number
                        ? user.user_metadata.phone_number.replace(/[^0-9]/g, '').replace(/^82/, '0')
                        : null
                    const kakaoGender = user.user_metadata?.gender || null
                    const kakaoBirthYear = user.user_metadata?.birthyear
                        ? parseInt(user.user_metadata.birthyear)
                        : null

                    if (kakaoPhone && !profile.phone) updates.phone = kakaoPhone
                    if (kakaoGender && !profile.gender) updates.gender = kakaoGender === 'male' ? '남성' : kakaoGender === 'female' ? '여성' : null
                    if (kakaoBirthYear && !profile.birth_year) updates.birth_year = kakaoBirthYear
                    if (!profile.auth_provider) updates.auth_provider = 'kakao'
                }

                if (Object.keys(updates).length > 0) {
                    await db.from('users').update({
                        ...updates,
                        updated_at: new Date().toISOString(),
                    }).eq('id', user.id)
                    console.log(`[Auth Callback] Updated existing user ${user.id}:`, Object.keys(updates))
                }

                // 기존 유저 재로그인 → next(기본 멘토 페이지)
                return NextResponse.redirect(`${origin}${next}`)
            }

            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // 에러 시 로그인 페이지로
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
