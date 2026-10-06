import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { timeoutFetch, DB_TIMEOUT_MS } from './timeout-fetch'

/** 로그인 표시가 이만큼 안에 끝나면 미들웨어가 미리 새로 받는다.
 *  서버 화면의 supabase-js 는 90초 안에 끝나는 표시를 스스로 새로 받는데(저장은 못 함), 그보다 앞서 받아 둔다 */
export const AUTH_REFRESH_MARGIN_SEC = 120

/**
 * 로그인 표시 쿠키(sb-<프로젝트>-auth-token, 길면 .0 .1 로 나뉨)가 있고 곧 끝나면 true.
 * 쿠키가 없으면 false(손님은 Supabase 를 부르지 않는다). 읽을 수 없는 모양이면 안전하게 true.
 * 왜: 봇 상세(mentors/[mentorId])·마켓(os/market/[mentorId]) 같은 서버 화면은 쿠키를 저장할 수 없다.
 *     거기서 표시를 새로 받으면 새 표시가 저장되지 않아 로그인이 풀린다. 그래서 끝나기 전에 미들웨어에서 받아 저장한다.
 */
export function authCookieNeedsRefresh(cookies: { name: string; value: string }[], nowSec: number = Math.floor(Date.now() / 1000), marginSec = AUTH_REFRESH_MARGIN_SEC): boolean {
    const re = /^(sb-.+-auth-token)(?:\.(\d+))?$/
    const groups = new Map<string, { idx: number; value: string }[]>()
    for (const c of cookies) {
        const m = re.exec(c.name)
        if (!m) continue
        const list = groups.get(m[1]) ?? []
        list.push({ idx: m[2] === undefined ? -1 : Number(m[2]), value: c.value })
        groups.set(m[1], list)
    }
    if (groups.size === 0) return false
    for (const parts of groups.values()) {
        const raw = parts.sort((a, b) => a.idx - b.idx).map(p => p.value).join('')
        try {
            const text = raw.startsWith('base64-')
                ? Buffer.from(raw.slice(7).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
                : decodeURIComponent(raw)
            const exp = Number((JSON.parse(text) as { expires_at?: unknown }).expires_at)
            if (!Number.isFinite(exp) || exp - nowSec < marginSec) return true
        } catch {
            return true
        }
    }
    return false
}

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
    // 보호 경로가 아니면: 로그인 표시 쿠키가 있고 곧 끝날 때만 새로 받는다(쿠키 저장은 미들웨어만 할 수 있다)
    const refreshOnly = !isProtectedPath
    if (refreshOnly && !authCookieNeedsRefresh(request.cookies.getAll())) {
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

    if (refreshOnly) {
        // 새 표시를 받아 응답 쿠키에 저장한다(setAll). 실패해도 화면은 그대로 연다
        try {
            const { error } = await supabase.auth.refreshSession()
            if (error) console.warn('[middleware] 로그인 표시 새로 받기 실패:', error.message)
        } catch (e) {
            console.warn('[middleware] 로그인 표시 새로 받기 실패:', e instanceof Error ? e.message : e)
        }
        return supabaseResponse
    }

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
