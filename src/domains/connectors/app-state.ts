// domains/connectors — 앱(아이폰·안드로이드)에서 시작한 OAuth 연결의 state.
//
// 웹은 쿠키로 「누가 시작했나」를 안다. 앱 안 브라우저는 그 쿠키가 없다.
// 그래서 state 자체에 사용자 번호·공급자·출처를 담아 서명(HMAC)한다.
//  - 만료 10분(STATE_MAX_AGE_SEC), 1회용 번호(nonce)는 쓰는 순간 표에 적어 두 번째를 막는다.
//  - 앱이 만든 비밀값의 해시(proof)도 state 에 넣는다. 돌아온 토큰은 바로 저장하지 않고 임시 표에 두며,
//    앱이 비밀값 원문(appSecret)을 들고 app-finish 를 불러야 저장된다(공격자의 시작 주소를 피해자가 마무리해도 거절).
//  - 사용자는 오직 이 서명된 state 로만 알아본다(콜백 요청의 쿠키는 보지 않는다 = 바꿔치기 불가).
//  - PKCE 원문(verifier)은 state 에 넣지 않는다(주소창에 드러난다). 열쇠와 nonce 로 다시 계산한다.
//
// 모양: "app.<본문 base64url>.<서명 base64url>"  (웹 state 는 점이 없는 무작위 글자라 구분된다)

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { STATE_MAX_AGE_SEC, deriveKey } from './oauth'
import { decryptSecret, encryptSecret } from './crypto'
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
    /** 앱이 만든 비밀값의 sha256(소문자 hex 64자) */
    pr: string
    /** 출처 */
    src: 'app'
    /** 만든 시각(초) */
    iat: number
}

const b64url = (buf: Buffer) => buf.toString('base64url')
export const KEY_LABEL_APP_STATE = 'curi-connect/app-state/v1'
export const KEY_LABEL_APP_PKCE = 'curi-connect/app-pkce/v1'
const hmac = (payload: string, key: Buffer) => b64url(createHmac('sha256', deriveKey(key, KEY_LABEL_APP_STATE)).update(payload).digest())
const sha256hex = (v: string) => createHash('sha256').update(v).digest('hex')
export const PROOF_RE = /^[0-9a-f]{64}$/
/** 앱 비밀값 원문 → 해시(앱은 이 해시를 appProof 로 보낸다) */
export const appProofOf = sha256hex

export function isAppState(state: string | null | undefined): boolean {
    return typeof state === 'string' && state.startsWith(APP_STATE_PREFIX)
}

export function newAppState(userId: string, providerId: string, key: Buffer, proof: string, nowSec = Math.floor(Date.now() / 1000)): { state: string; nonce: string } {
    const nonce = b64url(randomBytes(18))
    const s: AppOAuthState = { u: userId, p: providerId, n: nonce, pr: proof, src: 'app', iat: nowSec }
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
        if (typeof s.pr !== 'string' || !PROOF_RE.test(s.pr)) return null
        if (s.src !== 'app' || typeof s.iat !== 'number') return null
        if (nowSec - s.iat > STATE_MAX_AGE_SEC || nowSec < s.iat - 60) return null
        return { u: s.u, p: s.p, n: s.n, pr: s.pr, src: 'app', iat: s.iat }
    } catch {
        return null
    }
}

/** PKCE 원문. 시작할 때와 돌아왔을 때 같은 값이 나온다(열쇠를 모르면 못 만든다) */
export function appPkce(key: Buffer, nonce: string): { verifier: string; challenge: string } {
    const verifier = b64url(createHmac('sha256', deriveKey(key, KEY_LABEL_APP_PKCE)).update(nonce).digest())
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

// ── 토큰 임시 보관(connector_app_pending) ─────────────────────────────
// callback 은 토큰을 잠가 여기에 5분만 둔다. 딥링크로는 1회용 handoff 만 나간다(표에는 handoff 의 해시만 있다).

export const PENDING_TTL_MS = 5 * 60 * 1000
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000
const missing = (code?: string) => code === '42P01' || code === 'PGRST205'

export interface AppPending {
    user_id: string
    proof_hash: string
    kind: string
    secret_encrypted: string
    meta: Record<string, unknown> | null
}

/** 토큰 JSON 을 잠가 임시 표에 넣고 handoff(원문)를 돌려준다 */
export async function putAppPending(
    db: SupabaseClient, key: Buffer,
    input: { userId: string; proofHash: string; kind: string; tokenJson: string; meta?: Record<string, unknown> },
    nowMs = Date.now(),
): Promise<string> {
    const handoff = b64url(randomBytes(32))
    const { error } = await db.from('connector_app_pending').insert({
        handoff_hash: sha256hex(handoff),
        user_id: input.userId,
        proof_hash: input.proofHash,
        kind: input.kind,
        secret_encrypted: encryptSecret(input.tokenJson, key),
        meta: input.meta ?? {},
        expires_at: new Date(nowMs + PENDING_TTL_MS).toISOString(),
    })
    if (error) {
        if (missing(error.code)) throw new ConnectorTableMissing()
        throw new Error(error.message)
    }
    return handoff
}

/** handoff 로 한 번만 꺼낸다(DELETE ... RETURNING 이라 동시에 두 번 불러도 한 쪽만 받는다). 없거나 만료면 null */
export async function takeAppPending(
    db: SupabaseClient, handoff: string, userId: string, nowMs = Date.now(),
): Promise<AppPending | null> {
    // 본인 행만 꺼낸다 (교환번호를 가로챈 남이 틀린 로그인으로 불러 정상 연결을 지우지 못하게)
    const { data, error } = await db.from('connector_app_pending').delete()
        .eq('handoff_hash', sha256hex(handoff))
        .eq('user_id', userId)
        .gt('expires_at', new Date(nowMs).toISOString())
        .select('user_id, proof_hash, kind, secret_encrypted, meta')
        .maybeSingle()
    if (error) {
        if (missing(error.code)) throw new ConnectorTableMissing()
        throw new Error(error.message)
    }
    return (data as AppPending | null) ?? null
}

/** 앱이 보낸 비밀값 원문이 시작할 때 낸 해시와 같은가 */
export function proofMatches(appSecret: string, proofHash: string): boolean {
    const a = Buffer.from(sha256hex(String(appSecret ?? '')))
    const b = Buffer.from(String(proofHash ?? ''))
    return a.length === b.length && timingSafeEqual(a, b)
}

/** 임시 보관에서 꺼낸 열쇠를 푼다 */
export function openAppPending(row: AppPending, key: Buffer): string {
    return decryptSecret(row.secret_encrypted, key)
}

/** 하루 지난 1회용 번호·임시 보관 행을 지운다(크론). 지운 곳이 없어도 조용히 */
export async function purgeAppConnectRows(db: SupabaseClient, nowMs = Date.now()): Promise<void> {
    const cut = new Date(nowMs - PURGE_AFTER_MS).toISOString()
    for (const [t, col] of [['connector_app_nonces', 'created_at'], ['connector_app_pending', 'expires_at']] as const) {
        const { error } = await db.from(t).delete().lt(col, cut)
        if (error && !missing(error.code)) console.error('[connect/purge]', t, error.message)
    }
}
