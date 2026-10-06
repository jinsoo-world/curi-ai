import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { bearerFromHeader, bindBearerToAuth } from './bearer'
import { timeoutFetch, DB_TIMEOUT_MS } from './timeout-fetch'

export async function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        // 빌드 타임 fallback
        return createServerClient(
            'https://placeholder.supabase.co',
            'placeholder-key',
            {
                cookies: {
                    getAll() { return [] },
                    setAll() { },
                },
            }
        )
    }

    const cookieStore = await cookies()
    // 앱(iOS·안드로이드)은 쿠키 대신 Authorization: Bearer 로 로그인 표시를 보낸다 (bearer.ts)
    const bearer = bearerFromHeader((await headers()).get('authorization'))

    const client = createServerClient(supabaseUrl, supabaseAnonKey, {
        // 표시가 있으면 데이터 조회도 그 사용자 권한(RLS)으로 한다
        // 모든 요청에 마감: 보통 5초, 로그인 확인(auth.getUser) 3초 (timeout-fetch.ts)
        global: {
            fetch: timeoutFetch(DB_TIMEOUT_MS),
            ...(bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : {}),
        },
        cookies: {
            getAll() {
                return cookieStore.getAll()
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options)
                    )
                } catch {
                    // Server Component에서 호출 시 무시
                }
            },
        },
    })
    return bearer ? bindBearerToAuth(client, bearer) : client
}
