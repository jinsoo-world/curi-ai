// GET /api/connect/[provider]/start → 사용자를 그 서비스 로그인 화면으로 보낸다(본인 계정 OAuth 1단계).
//
//  - state 를 무작위로 만들고 서명해서 쿠키에 넣는다(돌아왔을 때 「내가 시작한 것인가」 확인).
//  - PKCE 를 받는 공급자면 code_challenge 도 같이 보낸다.
//  - 열쇠(환경변수)가 없는 공급자는 시작 자체가 막힌다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
    STATE_MAX_AGE_SEC, buildAuthUrl, findProvider, pkcePair, providerReady, randomState,
    readConnectorKey, redirectUri, signState, stateCookieName,
} from '@/domains/connectors'

export const dynamic = 'force-dynamic'

function appUrl(req: NextRequest): string {
    return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
    const { provider: id } = await params
    const base = appUrl(req)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(`${base}/login?next=/os/connect`)

    const p = findProvider(id)
    if (!p) return NextResponse.redirect(`${base}/os/connect?error=unknown`)
    if (!providerReady(p)) return NextResponse.redirect(`${base}/os/connect?error=not_ready&provider=${p.id}`)

    const key = readConnectorKey()
    const clientId = process.env[p.envClientId]?.trim()
    if (!key || !clientId) return NextResponse.redirect(`${base}/os/connect?error=not_ready&provider=${p.id}`)

    const state = randomState()
    const pk = p.pkce ? pkcePair() : null
    const cookie = signState({ provider: p.id, state, verifier: pk?.verifier, iat: Math.floor(Date.now() / 1000) }, key)

    const to = buildAuthUrl(p, { clientId, redirectUri: redirectUri(base, p.id), state, challenge: pk?.challenge })
    const res = NextResponse.redirect(to)
    res.cookies.set(stateCookieName(p.id), cookie, {
        httpOnly: true, sameSite: 'lax', secure: base.startsWith('https://'), path: '/api/connect', maxAge: STATE_MAX_AGE_SEC,
    })
    return res
}
