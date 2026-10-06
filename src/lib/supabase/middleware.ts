import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { timeoutFetch, DB_TIMEOUT_MS } from './timeout-fetch'

export async function updateSession(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.next({ request })
    }

    // 인증이 필요한 경로 보호 (채팅은 게스트 허용 — 멘토당 3회 무료)
    // 로그인 확인(Supabase 왕복)은 보호 경로에서만 한다. 예전엔 모든 화면마다 물어서
    // Supabase 가 느리면 사이트 전체가 같이 느려졌다 (2026-10-06 멈춤 점검)
    const protectedPaths = ['/profile', '/admin']
    const isProtectedPath = protectedPaths.some((path) =>
        request.nextUrl.pathname.startsWith(path)
    )
    if (!isProtectedPath) {
        return NextResponse.next({ request })
    }

    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        global: { fetch: timeoutFetch(DB_TIMEOUT_MS) },
        cookies: {
            getAll() {
                return request.cookies.getAll()
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) =>
                    request.cookies.set(name, value)
                )
                supabaseResponse = NextResponse.next({ request })
                cookiesToSet.forEach(({ name, value, options }) =>
                    supabaseResponse.cookies.set(name, value, options)
                )
            },
        },
    })

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('redirect', request.nextUrl.pathname)
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
