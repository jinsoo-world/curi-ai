// POST /api/connect/[provider]/app-start → 앱용 OAuth 1단계. 앱 Bearer 로그인으로 부르고 { url } 을 받는다.
//
//  - 웹 start 는 쿠키 로그인 + 리디렉트라 앱 안 브라우저에서 못 쓴다. 이쪽은 주소만 JSON 으로 준다.
//  - 사용자 번호·공급자·출처를 서명한 state 에 담는다(쿠키 없음). 돌아오는 자리는 기존 callback 그대로.
//  - 손님 401, 없는 공급자·열쇠 없는 공급자 400.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
    appPkce, buildAuthUrl, findProvider, newAppState, providerReady, readConnectorKey, redirectUri,
} from '@/domains/connectors'

export const dynamic = 'force-dynamic'

function appUrl(req: NextRequest): string {
    return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
    const { provider: id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const p = findProvider(id)
    if (!p) return NextResponse.json({ error: '우리가 아는 연결 종류가 아니에요' }, { status: 400 })
    if (!providerReady(p)) return NextResponse.json({ error: '아직 준비 중인 연결이에요' }, { status: 400 })

    const key = readConnectorKey()
    const clientId = process.env[p.envClientId]?.trim()
    if (!key || !clientId) return NextResponse.json({ error: '아직 준비 중인 연결이에요' }, { status: 400 })

    const { state, nonce } = newAppState(user.id, p.id, key)
    const url = buildAuthUrl(p, {
        clientId, redirectUri: redirectUri(appUrl(req), p.id), state,
        challenge: p.pkce ? appPkce(key, nonce).challenge : undefined,
    })
    return NextResponse.json({ url })
}
