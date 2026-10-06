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
    ConnectorTableMissing, TokenExchangeFailed, appPkce, appReturnUrl, consumeAppNonce, exchangeCode, fetchAccountHint,
    findProvider, isAppState, providerReady, putAppPending, readConnectorKey, redirectUri, replaceConnector, stateCookieName,
    verifyAppState, verifyState,
} from '@/domains/connectors'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function appUrl(req: NextRequest): string {
    return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
}

/**
 * 앱에서 시작한 연결. 쿠키·로그인 대신 서명된 state(사용자·공급자·출처·1회용 번호·앱 비밀값 해시·10분)로 사람을 알아본다.
 * 토큰은 바로 저장하지 않고 잠가서 임시 표(5분)에 두고, 딥링크로는 1회용 handoff 만 보낸다:
 *   curiai://connect?handoff=…&provider=…  → 앱이 POST /api/connect/app-finish { handoff, appSecret } 로 마무리
 * 실패는 curiai://connect?error=…&provider=… (토큰·열쇠 문구 없음).
 */
async function appCallback(req: NextRequest, id: string): Promise<NextResponse> {
    const base = appUrl(req)
    const back = (params: Record<string, string>) => NextResponse.redirect(appReturnUrl(params))
    const fail = (error: string) => back({ error, provider: id })

    const p = findProvider(id)
    if (!p) return fail('unknown')
    const q = req.nextUrl.searchParams
    const key = readConnectorKey()
    const clientId = process.env[p.envClientId]?.trim()
    const clientSecret = process.env[p.envClientSecret]?.trim()
    if (!key || !clientId || !clientSecret || !providerReady(p)) return fail('not_ready')

    const saved = verifyAppState(q.get('state'), key)
    if (!saved || saved.p !== p.id) return fail('bad_state')

    const db = createAdminClient()
    try {
        // 허용 안 함을 눌러도 번호는 쓴 것으로 친다
        if (!(await consumeAppNonce(db, saved.n, saved.u))) return fail('bad_state')
        if (q.get('error')) return fail('denied')
        const code = q.get('code') ?? ''
        if (!code) return fail('bad_state')

        const token = await exchangeCode(p, {
            code, redirectUri: redirectUri(base, p.id), clientId, clientSecret,
            verifier: p.pkce ? appPkce(key, saved.n).verifier : undefined, state: q.get('state') ?? undefined,
        })
        const hint = await fetchAccountHint(p, token)
        const handoff = await putAppPending(db, key, {
            userId: saved.u, proofHash: saved.pr, kind: p.id,
            tokenJson: JSON.stringify({ ...token, obtained_at: new Date().toISOString() }),
            meta: hint ? { hint } : {},
        })
        return back({ handoff, provider: p.id })
    } catch (e) {
        if (e instanceof TokenExchangeFailed) { console.error('[connect/callback:app]', p.id, 'token', e.status); return fail('token') }
        if (e instanceof ConnectorTableMissing) return fail('table')
        console.error('[connect/callback:app]', p.id, e instanceof Error ? e.message : 'unknown')
        return fail('save')
    }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
    const { provider: id } = await params
    if (isAppState(req.nextUrl.searchParams.get('state'))) return appCallback(req, id)
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
