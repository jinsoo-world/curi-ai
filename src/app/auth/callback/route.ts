import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/safe-next'
import { onboardingPathWithNext } from '@/domains/share/guestSignup'
import { cookies } from 'next/headers'
import { TERMS_COOKIE, parseTermsCookie } from '@/domains/os/onboarding'
import { runAfterLogin, adminDbOr } from '@/domains/auth/after-login'
import { saveAppleRefreshToken } from '@/domains/account/apple-token'

/** 새 가입자가 먼저 가는 온보딩 화면 (대표 승인 0928) */
const ONBOARDING_PATH = '/os/start'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // 로그인 뒤 돌아갈 주소. 우리 사이트 경로만 허용(//, http 로 시작하면 무시), 없으면 /os (대표 승인 0928)
    const next = safeNextPath(searchParams.get('next')) ?? '/os'
    // 새 회원 표시(new_user=true)를 next 주소에 붙인다. next 에 ? 가 이미 있어도 안전하게
    const withNewUser = (path: string) => {
        const u = new URL(path, origin)
        u.searchParams.set('new_user', 'true')
        return u.toString()
    }

    if (code) {
        const supabase = await createClient()
        const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            const {
                data: { user },
            } = await supabase.auth.getUser()

            if (user) {
                // 애플로 로그인했으면, 그때 한 번만 받는 애플 연결 열쇠를 잠가 둔다(탈퇴 때 애플 쪽 연결을 끊는 데 쓴다). 실패해도 로그인은 그대로
                if (user.app_metadata?.provider === 'apple') {
                    await saveAppleRefreshToken(adminDbOr(supabase), user.id, exchanged?.session?.provider_refresh_token)
                }
                // 로그인 직후 일(가입 선물·온보딩·회원 행·카카오 정보)은 앱과 같이 쓰는 runAfterLogin 이 한다 (2026-10-01 분리, 동작 같음)
                const db = adminDbOr(supabase)
                const cookieStore = await cookies()
                const refCode = cookieStore.get('curi_ref')?.value || null
                const { isNewProfile, goOnboarding } = await runAfterLogin(db, user, {
                    refCode,
                    termsAt: parseTermsCookie(cookieStore.get(TERMS_COOKIE)?.value),
                })
                const landing = goOnboarding ? onboardingPathWithNext(ONBOARDING_PATH, next) : next

                if (isNewProfile) {
                    if (refCode) {
                        // 쿠키 소비 (삭제)
                        const response = NextResponse.redirect(withNewUser(landing))
                        response.cookies.delete('curi_ref')
                        response.cookies.delete(TERMS_COOKIE)
                        return response
                    }
                    // 신규 유저 → 온보딩 또는 next
                    return NextResponse.redirect(withNewUser(landing))
                }

                // 새 가입자 = 온보딩, 기존 회원 = next (기본 /os)
                const done = NextResponse.redirect(`${origin}${landing}`)
                done.cookies.delete(TERMS_COOKIE)
                return done
            }
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // 에러 시 로그인 페이지로
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
