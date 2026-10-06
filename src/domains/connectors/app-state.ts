// domains/connectors — 앱(아이폰·안드로이드)에서 시작한 OAuth 연결의 state.
//
// 웹은 쿠키로 「누가 시작했나」를 안다. 앱 안 브라우저는 그 쿠키가 없다.
// 그래서 state 자체에 사용자 번호·공급자·출처를 담아 서명(HMAC)한다.
//  - 만료 10분(STATE_MAX_AGE_SEC), 1회용 번호(nonce)는 쓰는 순간 표에 적어 두 번째를 막는다.
//  - 사용자는 오직 이 서명된 state 로만 알아본다(콜백 요청의 쿠키는 보지 않는다 = 바꿔치기 불가).
//  - PKCE 원문(verifier)은 state 에 넣지 않는다(주소창에 드러난다). 열쇠와 nonce 로 다시 계산한다.
//
// 모양: "app.<본문 base64url>.<서명 base64url>"  (웹 state 는 점이 없는 무작위 글자라 구분된다)

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { STATE_MAX_AGE_SEC } from './oauth'
import { ConnectorTableMissing } from './store'

export const APP_STATE_PREFIX = 'app.'
/** 앱 연결이 끝나면 돌아가는 주소(앱의 딥링크) */
export const APP_RETURN_SCHEME = 'curiai://connect'

export interface AppOAuthState {
    /** 사용자 번호 */
    u: string
    /** 공급자 */
    p: string
    /** 1회용 번호 */
    n: string
    /** 출처 */
    src: 'app'
    /** 만든 시각(초) */
    iat: number
}

const b64url = (buf: Buffer) => buf.toString('base64url')
const hmac = (payload: string, key: Buffer) => b64url(createHmac('sha256', key).update(payload).digest())

export function isAppState(state: string | null | undefined): boolean {
    return typeof state === 'string' && state.startsWith(APP_STATE_PREFIX)
}

export function newAppState(userId: string, providerId: string, key: Buffer, nowSec = Math.floor(Date.now() / 1000)): { state: string; nonce: string } {
    const nonce = b64url(randomBytes(18))
    const s: AppOAuthState = { u: userId, p: providerId, n: nonce, src: 'app', iat: nowSec }
    const body = b64url(Buffer.from(JSON.stringify(s), 'utf8'))
    return { state: `${APP_STATE_PREFIX}${body}.${hmac(body, key)}`, nonce }
}

/** 서명이 다르거나, 10분이 지났거나, 모양이 틀리면 null */
export function verifyAppState(state: string | null | undefined, key: Buffer, nowSec = Math.floor(Date.now() / 1000)): AppOAuthState | null {
    if (!isAppState(state)) return null
    const parts = String(state).slice(APP_STATE_PREFIX.length).split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    const [body, sig] = parts
    const want = Buffer.from(hmac(body, key))
    const got = Buffer.from(sig)
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null
    try {
        const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<AppOAuthState>
        if (typeof s.u !== 'string' || !s.u || typeof s.p !== 'string' || typeof s.n !== 'string' || !s.n) return null
        if (s.src !== 'app' || typeof s.iat !== 'number') return null
        if (nowSec - s.iat > STATE_MAX_AGE_SEC || nowSec < s.iat - 60) return null
        return { u: s.u, p: s.p, n: s.n, src: 'app', iat: s.iat }
    } catch {
        return null
    }
}

/** PKCE 원문. 시작할 때와 돌아왔을 때 같은 값이 나온다(열쇠를 모르면 못 만든다) */
export function appPkce(key: Buffer, nonce: string): { verifier: string; challenge: string } {
    const verifier = b64url(createHmac('sha256', key).update(`pkce:${nonce}`).digest())
    return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) }
}

/** 1회용 번호를 쓴다. 처음이면 true, 이미 썼으면 false. 표가 없으면 ConnectorTableMissing */
export async function consumeAppNonce(db: SupabaseClient, nonce: string, userId: string): Promise<boolean> {
    const { error } = await db.from('connector_app_nonces').insert({ nonce, user_id: userId })
    if (!error) return true
    if (error.code === '23505') return false
    if (error.code === '42P01' || error.code === 'PGRST205') throw new ConnectorTableMissing()
    throw new Error(error.message)
}

/** 앱으로 돌려보낼 딥링크 */
export function appReturnUrl(params: Record<string, string>): string {
    return `${APP_RETURN_SCHEME}?${new URLSearchParams(params).toString()}`
}
