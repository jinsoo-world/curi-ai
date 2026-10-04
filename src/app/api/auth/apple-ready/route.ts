import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * 애플 로그인 단추를 보여도 되나 (2026-10-05).
 * Supabase 에서 애플이 「켜져 있고 열쇠까지 들어 있을 때만」 로그인 시작 주소가 애플로 넘어간다.
 * 열쇠가 비어 있으면 400(missing OAuth secret)이라 단추를 눌러도 오류만 난다. 그래서 그때는 단추를 숨긴다.
 * 대표가 Supabase 에 애플 설정을 마치면 다시 배포하지 않아도 이 확인이 통과해 단추가 저절로 나타난다.
 * APPLE_LOGIN_DISABLED=1 이면 항상 끈다(긴급 스위치). 결과는 5분 기억한다.
 */
let cache: { at: number; ready: boolean } | null = null
const TTL_MS = 5 * 60_000

export async function GET() {
    const headers = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
    if (process.env.APPLE_LOGIN_DISABLED === '1') return NextResponse.json({ ready: false }, { headers })
    if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json({ ready: cache.ready }, { headers })
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    let ready = false
    if (base && key) {
        try {
            const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.curi-ai.com'
            const res = await fetch(`${base}/auth/v1/authorize?provider=apple&redirect_to=${encodeURIComponent(`${site}/auth/callback`)}`, {
                headers: { apikey: key }, redirect: 'manual', signal: AbortSignal.timeout(4000),
            })
            const to = res.headers.get('location') || ''
            ready = res.status >= 300 && res.status < 400 && /appleid\.apple\.com/.test(to)
        } catch { ready = false }
    }
    cache = { at: Date.now(), ready }
    return NextResponse.json({ ready }, { headers })
}
