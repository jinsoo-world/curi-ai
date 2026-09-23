// GET /api/connect/[provider]/callback → 서비스가 code 를 들고 돌려보낸 자리(본인 계정 OAuth 2단계).
//
//  1) 쿠키 서명·state 확인(내가 시작한 것인가, 10분 안인가)
//  2) code → 토큰 (토큰은 여기서만 잠깐 손에 든다. 로그 금지)
//  3) 계정 힌트(jin@…)만 읽고, 토큰 JSON 은 잠가서 connectors 에 넣는다(공급자당 1개, 갈아 끼움)
//  4) /os/connect 로 돌려보낸다. 실패해도 이유 코드만 붙인다(토큰·열쇠 문구 없음)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    ConnectorTableMissing, TokenExchangeFailed, exchangeCode, fetchAccountHint, findProvider, providerReady,
    readConnectorKey, redirectUri, replaceConnector, stateCookieName, verifyState,
} from '@/domains/connectors'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function appUrl(req: NextRequest): string {
    return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
    const { provider: id } = await params
    const base = appUrl(req)
    const back = (q: string) => {
        const res = NextResponse.redirect(`${base}/os/connect?${q}`)
        res.cookies.set(stateCookieName(id), '', { path: '/api/connect', maxAge: 0 })
        return res
    }

    const p = findProvider(id)
    if (!p) return back('error=unknown')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(`${base}/login?next=/os/connect`)

    const q = req.nextUrl.searchParams
    if (q.get('error')) return back(`error=denied&provider=${p.id}`)      // 사용자가 「허용 안 함」을 눌렀다
    const code = q.get('code') ?? ''
    const state = q.get('state') ?? ''
    if (!code || !state) return back(`error=bad_state&provider=${p.id}`)

    const key = readConnectorKey()
    const clientId = process.env[p.envClientId]?.trim()
    const clientSecret = process.env[p.envClientSecret]?.trim()
    if (!key || !clientId || !clientSecret || !providerReady(p)) return back(`error=not_ready&provider=${p.id}`)

    const saved = verifyState(req.cookies.get(stateCookieName(p.id))?.value, key)
    if (!saved || saved.provider !== p.id || saved.state !== state) return back(`error=bad_state&provider=${p.id}`)

    try {
        const token = await exchangeCode(p, {
            code, redirectUri: redirectUri(base, p.id), clientId, clientSecret, verifier: saved.verifier, state,
        })
        const hint = await fetchAccountHint(p, token)
        await replaceConnector(createAdminClient(), user.id, {
            kind: p.id, label: p.name,
            secret: JSON.stringify({ ...token, obtained_at: new Date().toISOString() }),
            meta: hint ? { hint } : {},
        })
        return back(`connected=${p.id}`)
    } catch (e) {
        if (e instanceof TokenExchangeFailed) { console.error('[connect/callback]', p.id, 'token', e.status); return back(`error=token&provider=${p.id}`) }
        if (e instanceof ConnectorTableMissing) return back(`error=table&provider=${p.id}`)
        console.error('[connect/callback]', p.id, e instanceof Error ? e.message : 'unknown')
        return back(`error=save&provider=${p.id}`)
    }
}
