// domains/connectors — 범용 OAuth2 흐름의 순수 부품(인터넷·DB 없이 시험할 수 있는 것만).
//
//  1) start  : state(무작위) + PKCE 를 만들고, 서명해서 쿠키에 넣고, 사용자를 공급자 로그인으로 보낸다.
//  2) callback: 쿠키 서명·state 가 맞는지 보고, code 를 토큰으로 바꾼다.
//
// 🔐 서명 열쇠는 CONNECTOR_SECRET_KEY(연결 자물쇠)를 같이 쓴다. 열쇠가 없으면 연결 기능 자체가 꺼진다.
// 🔐 토큰·client secret 은 로그·응답·오류 문구에 절대 넣지 않는다.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import type { Provider, TokenJson } from './providers'

/** 쿠키에 넣는 내용 */
export interface OAuthState {
    provider: string
    state: string
    /** PKCE 확인용 원문(공급자에 code_challenge 로 보낸 것의 원본) */
    verifier?: string
    /** 만든 시각(초) */
    iat: number
}

/** 쿠키 이름. 공급자별로 나눠 두 창을 동시에 열어도 안 섞인다 */
export function stateCookieName(providerId: string): string {
    return `cx_oauth_${providerId}`
}

/** state 유효 시간(초). 로그인 화면에서 10분 넘게 머물면 다시 시작한다 */
export const STATE_MAX_AGE_SEC = 600

const b64url = (buf: Buffer) => buf.toString('base64url')

export function randomState(): string {
    return b64url(randomBytes(24))
}

/** PKCE: verifier(원문)와 challenge(S256 해시) 한 쌍 */
export function pkcePair(): { verifier: string; challenge: string } {
    const verifier = b64url(randomBytes(32))
    const challenge = b64url(createHash('sha256').update(verifier).digest())
    return { verifier, challenge }
}

function hmac(payload: string, key: Buffer): string {
    return b64url(createHmac('sha256', key).update(payload).digest())
}

/** 쿠키 값 = "본문(base64url).서명(base64url)" */
export function signState(s: OAuthState, key: Buffer): string {
    const body = b64url(Buffer.from(JSON.stringify(s), 'utf8'))
    return `${body}.${hmac(body, key)}`
}

/**
 * 쿠키 값을 검증해 되돌린다. 서명이 다르거나, 너무 오래됐거나, 모양이 틀리면 null.
 * 비교는 timingSafeEqual 로(한 글자씩 맞춰 보는 공격을 막는다).
 */
export function verifyState(cookie: string | undefined, key: Buffer, nowSec = Math.floor(Date.now() / 1000)): OAuthState | null {
    const parts = String(cookie ?? '').split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    const [body, sig] = parts
    const want = Buffer.from(hmac(body, key))
    const got = Buffer.from(sig)
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null
    try {
        const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<OAuthState>
        if (typeof s.provider !== 'string' || typeof s.state !== 'string' || typeof s.iat !== 'number') return null
        if (nowSec - s.iat > STATE_MAX_AGE_SEC || nowSec < s.iat - 60) return null
        return { provider: s.provider, state: s.state, verifier: typeof s.verifier === 'string' ? s.verifier : undefined, iat: s.iat }
    } catch {
        return null
    }
}

/** 우리 쪽 돌아오는 주소. 콘솔에 등록하는 값과 글자 하나까지 같아야 한다 */
export function redirectUri(appUrl: string, providerId: string): string {
    return `${appUrl.replace(/\/+$/, '')}/api/connect/${providerId}/callback`
}

/** 사용자를 보낼 로그인 주소 */
export function buildAuthUrl(p: Provider, args: { clientId: string; redirectUri: string; state: string; challenge?: string }): string {
    const u = new URL(p.authUrl)
    u.searchParams.set('client_id', args.clientId)
    u.searchParams.set('redirect_uri', args.redirectUri)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('state', args.state)
    if (p.scopes.length) u.searchParams.set('scope', p.scopes.join(p.scopeSeparator))
    if (p.pkce && args.challenge) {
        u.searchParams.set('code_challenge', args.challenge)
        u.searchParams.set('code_challenge_method', 'S256')
    }
    for (const [k, v] of Object.entries(p.extraAuthParams ?? {})) u.searchParams.set(k, v)
    return u.toString()
}

export class TokenExchangeFailed extends Error {
    constructor(public readonly status: number) { super(`토큰을 받지 못했다 (${status})`) }
}

/**
 * code → 토큰. 응답 JSON 을 그대로 돌려준다(부르는 쪽이 잠가서 저장한다).
 * ⚠️ 여기서 받은 것을 console 에 찍지 마라.
 */
export async function exchangeCode(
    p: Provider,
    args: { code: string; redirectUri: string; clientId: string; clientSecret: string; verifier?: string; state?: string },
    fetchImpl: typeof fetch = fetch,
): Promise<TokenJson> {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: args.code,
        redirect_uri: args.redirectUri,
    })
    const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',      // 깃허브는 이걸 안 주면 쿼리 문자열로 답한다
    }
    if (p.tokenAuth === 'basic') {
        headers.Authorization = `Basic ${Buffer.from(`${args.clientId}:${args.clientSecret}`).toString('base64')}`
    } else {
        body.set('client_id', args.clientId)
        body.set('client_secret', args.clientSecret)
    }
    if (p.pkce && args.verifier) body.set('code_verifier', args.verifier)
    if (p.tokenNeedsState && args.state) body.set('state', args.state)

    const r = await fetchImpl(p.tokenUrl, { method: 'POST', headers, body, signal: AbortSignal.timeout(15_000) })
    if (!r.ok) throw new TokenExchangeFailed(r.status)
    const json = await r.json().catch(() => null) as TokenJson | null
    if (!json || typeof json !== 'object') throw new TokenExchangeFailed(r.status)
    // 슬랙은 200 으로 답하면서 ok:false 를 넣는다
    if (json.ok === false || typeof json.error === 'string') throw new TokenExchangeFailed(400)
    if (typeof json.access_token !== 'string' || !json.access_token) throw new TokenExchangeFailed(400)
    return json
}

/** 계정 힌트 가리기: jin@mission-driven.kr → jin@… / 열정진 → 열정… (본문은 절대 다 보이지 않는다) */
export function maskAccount(raw: string | null | undefined): string | null {
    const v = String(raw ?? '').trim()
    if (!v) return null
    const at = v.indexOf('@')
    if (at > 0) return `${v.slice(0, Math.min(3, at))}@…`
    return v.length <= 3 ? `${v}…` : `${v.slice(0, 3)}…`
}

/** 계정 힌트 읽기. 못 읽어도 연결은 살린다(null) */
export async function fetchAccountHint(p: Provider, token: TokenJson, fetchImpl: typeof fetch = fetch): Promise<string | null> {
    const a = p.account
    if (!a) return null
    try {
        if (a.fromToken) {
            const v = a.fromToken(token)
            if (v) return maskAccount(v)
        }
        if (a.url && a.pick) {
            const access = typeof token.access_token === 'string' ? token.access_token
                : typeof (token.authed_user as Record<string, unknown> | undefined)?.access_token === 'string'
                    ? String((token.authed_user as Record<string, unknown>).access_token) : ''
            if (!access) return null
            const r = await fetchImpl(a.url, {
                headers: { Authorization: `Bearer ${access}`, Accept: 'application/json', 'User-Agent': 'curi-ai-connect' },
                signal: AbortSignal.timeout(8_000),
            })
            if (!r.ok) return null
            const j = await r.json().catch(() => null) as Record<string, unknown> | null
            return j ? maskAccount(a.pick(j)) : null
        }
    } catch { /* 힌트는 없어도 된다 */ }
    return null
}

/**
 * 잠긴 열쇠를 풀었을 때 그것이 OAuth 토큰 JSON 이면 access_token 만 꺼낸다. 손으로 붙인 토큰(ntn_…)이나 웹훅 주소는 그대로.
 * 그래서 노션 도구는 손으로 붙였든 로그인으로 붙였든 같은 값을 받는다.
 */
export function extractAccessToken(secret: string): string {
    const v = String(secret ?? '').trim()
    if (!v.startsWith('{')) return v
    try {
        const j = JSON.parse(v) as Record<string, unknown>
        if (typeof j.access_token === 'string' && j.access_token) return j.access_token
        const au = j.authed_user as Record<string, unknown> | undefined
        if (au && typeof au.access_token === 'string') return au.access_token
    } catch { /* JSON 이 아니면 그대로 */ }
    return v
}
