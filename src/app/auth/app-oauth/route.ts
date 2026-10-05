import { NextResponse } from 'next/server'

// 앱(아이폰·안드로이드) 카카오·구글 로그인 시작 주소.
// 앱이 supabase 주소를 바로 열면 iOS 확인 창에 supabase 도메인이 뜬다.
// 우리 도메인(/auth/app-oauth)을 먼저 열고 여기서 supabase 로 넘기면 창에 curi-ai.com 이 뜬다.
const PROVIDERS = new Set(['kakao', 'google'])
// 앱 로그인 복귀 주소는 이 하나뿐 (iOS·안드로이드 공통). 다른 값은 열린 리디렉트라 거부
const APP_REDIRECT = 'curiai://login-callback'
// 그대로 넘기는 쿼리. 이 밖의 것은 버린다
const PASS_THROUGH = ['code_challenge', 'code_challenge_method', 'scopes', 'prompt']

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider') ?? ''
    if (!PROVIDERS.has(provider)) return new NextResponse('invalid provider', { status: 400 })
    if (searchParams.get('redirect_to') !== APP_REDIRECT) return new NextResponse('invalid redirect_to', { status: 400 })

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!base) return new NextResponse('not configured', { status: 500 })

    const target = new URL('/auth/v1/authorize', base)
    target.searchParams.set('provider', provider)
    target.searchParams.set('redirect_to', APP_REDIRECT)
    for (const key of PASS_THROUGH) {
        const v = searchParams.get(key)
        if (v !== null) target.searchParams.set(key, v)
    }
    return NextResponse.redirect(target.toString(), 302)
}
