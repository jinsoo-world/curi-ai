// domains/messaging — 채널별 광고 동의 · 받지 않을 사람 명단 · 로그인 없는 수신 거부 (설계서 1002 4-4·4-5).
//
// 동의: 예전엔 users.marketing_consent 한 칸(화면 문구 「문자, 이메일, 앱 알림」 한꺼번에)뿐이었다.
//   이제 채널마다 한 칸(ad_consent_app_push·ad_consent_web_push·ad_consent_email·ad_consent_sms).
//   옮겨 담기 = marketing_consent 가 참인 사람은 네 칸 모두 참(splitConsent).
//   옮기기 전 참 인원 = 옮긴 뒤 각 칸 참 인원이어야 관문이 새 칸을 본다(verifyBackfill). 9/29 큐리어스 사고는 이걸 안 세서 났다.
//   그 뒤 marketing_consent 를 바꾸면 DB 트리거가 네 칸을 같이 바꾼다(가입·내 정보 화면이 옛 칸을 쓰므로).
//
// 받지 않을 사람 명단(message_suppressions): 주소 원문 대신 지문(sha256)만.
//   scope=all  = 반송·스팸신고·결번 → 정보·광고 모두 막는다
//   scope=ad   = 수신 거부·탈퇴 → 광고만 막는다. 단 그 뒤에 본인이 다시 동의했으면(ad_consent_updated_at 이 더 늦으면) 막지 않는다
//
// 수신 거부 주소: /api/unsubscribe?t=<서명>. 서명 = HMAC-SHA256(MSG_UNSUBSCRIBE_SECRET). 열쇠가 없으면 주소를 만들지 않는다.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Category, Route } from './registry'

export const CONSENT_COLUMN: Record<Route, string> = {
    app_push: 'ad_consent_app_push',
    web_push: 'ad_consent_web_push',
    email: 'ad_consent_email',
    sms: 'ad_consent_sms',
}

export type ChannelConsent = Record<Route, boolean>

/** 옛 한 칸 → 채널 네 칸. 가입 화면 문구가 「문자, 이메일, 앱 알림」 한꺼번에였으므로 참이면 네 칸 모두 참 */
export function splitConsent(marketingConsent: boolean | null | undefined): ChannelConsent {
    const on = marketingConsent === true
    return { app_push: on, web_push: on, email: on, sms: on }
}

export interface BackfillCounts {
    /** 옮기기 전 marketing_consent = true 인원 */
    before: number
    /** 옮긴 뒤 각 칸 참 인원 */
    after: Record<Route, number>
    /** 옮긴 뒤 marketing_consent = true 인데 어느 칸이라도 거짓인 사람 (0 이어야 한다) */
    mismatched: number
}

/** 옮겨 담기가 맞았나. 인원 차이가 하나라도 있으면 ok=false 와 이유 */
export function verifyBackfill(c: BackfillCounts): { ok: boolean; problems: string[] } {
    const problems: string[] = []
    for (const r of Object.keys(c.after) as Route[]) {
        if (c.after[r] !== c.before) problems.push(`${r}: 옮기기 전 ${c.before}명, 옮긴 뒤 ${c.after[r]}명`)
    }
    if (c.mismatched !== 0) problems.push(`옛 칸은 참인데 새 칸이 거짓인 사람 ${c.mismatched}명`)
    return { ok: problems.length === 0, problems }
}

// ───────── 지문 ─────────

export type AddressKind = 'email' | 'phone' | 'user'

/** 주소 → 지문. 같은 주소는 늘 같은 지문(이메일은 소문자, 전화는 숫자만, 회원은 번호) */
export function hashAddress(kind: AddressKind, raw: string): string {
    let v = raw.trim()
    if (kind === 'email') v = v.toLowerCase()
    if (kind === 'phone') {
        v = v.replace(/[^0-9]/g, '')
        if (v.startsWith('82')) v = '0' + v.slice(2)
    }
    return createHash('sha256').update(`${kind}:${v}`).digest('hex')
}

export type SuppressionChannel = Route | 'all'
export type SuppressionReason = 'unsubscribe' | 'bounce' | 'complaint' | 'dead_number' | 'deleted_account'

export const SUPPRESSION_SCOPE: Record<SuppressionReason, 'all' | 'ad'> = {
    unsubscribe: 'ad',
    deleted_account: 'ad',
    bounce: 'all',
    complaint: 'all',
    dead_number: 'all',
}

export interface SuppressionRow {
    channel: SuppressionChannel
    reason: SuppressionReason
    scope: 'all' | 'ad'
    created_at: string
}

/**
 * 명단 줄 중 이 메시지를 막는 것이 있나. 막는 줄의 이유를 돌려준다(없으면 null).
 * consentAt = 본인이 광고 동의를 마지막으로 바꾼 시각. 그보다 먼저 생긴 수신 거부·탈퇴 줄은 광고를 막지 않는다(다시 동의한 것).
 */
export function suppressionApplies(rows: SuppressionRow[], category: Category, consentAt: string | null): SuppressionReason | null {
    const consent = consentAt ? new Date(consentAt).getTime() : null
    for (const r of rows) {
        if (r.scope === 'all') return r.reason
        if (category !== 'ad') continue
        if (consent !== null && Number.isFinite(consent) && new Date(r.created_at).getTime() < consent) continue
        return r.reason
    }
    return null
}

/** 화면·기록용으로 주소 일부만 */
export function addressHint(kind: AddressKind, raw: string): string {
    if (kind === 'user') return raw.slice(0, 8)
    if (kind === 'email') return `${raw.split('@')[0].slice(0, 2)}…`
    return raw.replace(/[^0-9]/g, '').slice(-4)
}

// ───────── 로그인 없는 수신 거부 서명 ─────────

export type UnsubscribeTarget = Route | 'all'
const UNSUB_TARGETS: UnsubscribeTarget[] = ['app_push', 'web_push', 'email', 'sms', 'all']

const b64u = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

export function unsubscribeSecret(): string | null {
    const s = process.env.MSG_UNSUBSCRIBE_SECRET
    return s && s.length >= 16 ? s : null
}

export function signUnsubscribe(userId: string, target: UnsubscribeTarget, secret: string): string {
    const payload = b64u(Buffer.from(JSON.stringify({ u: userId, c: target, v: 1 })))
    const sig = b64u(createHmac('sha256', secret).update(payload).digest())
    return `${payload}.${sig}`
}

export function verifyUnsubscribe(token: string | null | undefined, secret: string): { userId: string; target: UnsubscribeTarget } | null {
    if (!token || typeof token !== 'string' || token.length > 600) return null
    const [payload, sig, extra] = token.split('.')
    if (!payload || !sig || extra !== undefined) return null
    const want = createHmac('sha256', secret).update(payload).digest()
    const got = fromB64u(sig)
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null
    try {
        const p = JSON.parse(fromB64u(payload).toString('utf8')) as { u?: unknown; c?: unknown; v?: unknown }
        if (p.v !== 1 || typeof p.u !== 'string' || !/^[0-9a-f-]{36}$/i.test(p.u)) return null
        if (!UNSUB_TARGETS.includes(p.c as UnsubscribeTarget)) return null
        return { userId: p.u, target: p.c as UnsubscribeTarget }
    } catch {
        return null
    }
}

/** 메일·문자 꼬리에 넣을 주소. 열쇠가 없으면 null(관문이 광고 메일을 막는다) */
export function unsubscribeUrl(userId: string, target: UnsubscribeTarget, base = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.curi-ai.com'): string | null {
    const secret = unsubscribeSecret()
    if (!secret) return null
    return `${base.replace(/\/$/, '')}/api/unsubscribe?t=${signUnsubscribe(userId, target, secret)}`
}
