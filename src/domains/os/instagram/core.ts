// 봇 「내 SNS 연결 — 인스타그램」 순수 부품 (인터넷·DB 없이 시험할 수 있는 것만). 서버 전용.
//
// 방식 = 메타 「Instagram API with Instagram Login」(페이스북 페이지 필요 없음). 페이스북 로그인 방식이 아니다.
//   조사 = 03_CTO/2_큐리AI/진행중/1006_인스타연동_크리에이틀리조사.md
// 권한 = instagram_business_basic 하나 (내 프로필 + 내 게시물 읽기). 올리기·메시지·댓글 권한은 받지 않는다.
// 프로페셔널(비즈니스, 크리에이터) 계정만 된다. 개인 계정은 어떤 공식 방식으로도 안 된다.
//
// 🔐 열쇠
//   - 앱 설정 3개는 환경변수에만 (INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI). 공개 저장소라 기본값 없음
//   - state 서명, 토큰 잠금은 연결 자물쇠(CONNECTOR_SECRET_KEY)에서 HKDF 로 갈라낸 용도별 열쇠 (커넥터 열쇠와 서로 안 통한다)
//   - 토큰은 로그, 응답, 오류 문구, 주소(딥링크)에 절대 넣지 않는다

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { deriveKey, STATE_MAX_AGE_SEC } from '@/domains/connectors/oauth'
import { readConnectorKey } from '@/domains/connectors/crypto'
import type { FeedItem } from '@/domains/os/feeds/types'

export const INSTAGRAM_SCOPE = 'instagram_business_basic'
export const INSTAGRAM_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize'
/** 한 번 배우기에서 훑는 최근 게시물 수 (다른 SNS 칸과 같은 크기) */
export const INSTAGRAM_MAX_MEDIA = 60
/** 게시물 글 하나 최대 글자 (SNS 칸 공통 SNS_ITEM_MAX_CHARS 와 같다) */
export const INSTAGRAM_ITEM_MAX_CHARS = 20_000
/** 이것보다 짧은 글은 배울 게 없어 뺀다 (syncFeed 의 최소 글자와 같다) */
export const INSTAGRAM_MIN_CAPTION = 20
export const IG_STATE_MAX_AGE_SEC = STATE_MAX_AGE_SEC
/** 열쇠 연장: 마지막 연장 뒤 24시간이 지났고, 15일 안에 끝나는 열쇠만 (메타 규칙: 24시간 지난 60일 열쇠만 연장된다) */
export const REFRESH_MIN_AGE_MS = 24 * 3600_000
export const REFRESH_WINDOW_MS = 15 * 24 * 3600_000

/** 앱 연결 임시 보관 표(connector_app_pending)의 종류 이름 */
export const IG_PENDING_KIND = 'sns_instagram'

export const KEY_LABEL_IG_STATE = 'curi-sns/instagram-state/v1'
export const KEY_LABEL_IG_TOKEN = 'curi-sns/instagram-token/v1'

export const INSTAGRAM_RECONNECT_NOTE = '인스타그램 연결이 끊겼어요. 다시 연결해 주세요'
export const INSTAGRAM_DISCONNECTED_NOTE = '인스타그램 연결을 끊었어요. 배운 글은 그대로 있어요'
export const INSTAGRAM_PROFESSIONAL_ONLY = '프로페셔널(비즈니스·크리에이터) 계정만 연결돼요'

/* ─────────────────────────── 설정 ─────────────────────────── */

export interface InstagramConfig { appId: string; appSecret: string; redirectUri: string }
type Env = Record<string, string | undefined>

/** 앱 설정 3개. 하나라도 없거나 돌아오는 주소가 이상하면 null = 기능 꺼짐(「곧 열려요」) */
export function readInstagramConfig(env: Env = process.env): InstagramConfig | null {
    const appId = (env.INSTAGRAM_APP_ID ?? '').trim()
    const appSecret = (env.INSTAGRAM_APP_SECRET ?? '').trim()
    const redirectUri = (env.INSTAGRAM_REDIRECT_URI ?? '').trim()
    if (!appId || !appSecret || !redirectUri) return null
    let u: URL
    try { u = new URL(redirectUri) } catch { return null }
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) return null
    return { appId, appSecret, redirectUri }
}

/** 앱 설정 3개 + 연결 자물쇠가 다 있어야 켠다 (앱 설정 창구의 instagramConnect) */
export function instagramConnectEnabled(env: Env = process.env): boolean {
    return readInstagramConfig(env) !== null && readConnectorKey(env.CONNECTOR_SECRET_KEY) !== null
}

/** 토큰 잠금 전용 열쇠 (커넥터 토큰 열쇠와 갈라 둔다) */
export function igTokenKey(master: Buffer): Buffer {
    return deriveKey(master, KEY_LABEL_IG_TOKEN)
}

/* ─────────────────────────── state ─────────────────────────── */
// 모양 "ig.<본문 base64url>.<서명 base64url>". 본문 = 사용자·봇·1회용 번호·출처(+앱 비밀값 해시)·시각.
// 1회용 번호는 돌아왔을 때 connector_app_nonces 에 적어 두 번째를 막는다(웹, 앱 둘 다).

export const IG_STATE_PREFIX = 'ig.'
const PROOF_RE = /^[0-9a-f]{64}$/
const b64url = (b: Buffer) => b.toString('base64url')

export interface IgState {
    /** 사용자 번호 */ u: string
    /** 봇 번호 (mentor_id) */ m: string
    /** 1회용 번호 */ n: string
    /** 시작한 곳 */ src: 'web' | 'app'
    /** 앱 비밀값의 sha256 (앱일 때만) */ pr?: string
    /** 만든 시각(초) */ iat: number
}

const sign = (body: string, master: Buffer) => b64url(createHmac('sha256', deriveKey(master, KEY_LABEL_IG_STATE)).update(body).digest())

export function signIgState(
    a: { userId: string; mentorId: string; src: 'web' | 'app'; proof?: string }, master: Buffer, nowSec = Math.floor(Date.now() / 1000),
): { state: string; nonce: string } {
    if (!a.userId || !a.mentorId) throw new Error('state 에 넣을 사람과 봇이 없다')
    if (a.src === 'app' && !PROOF_RE.test(a.proof ?? '')) throw new Error('앱 state 에는 비밀값 해시가 있어야 한다')
    const nonce = b64url(randomBytes(18))
    const s: IgState = { u: a.userId, m: a.mentorId, n: nonce, src: a.src, ...(a.src === 'app' ? { pr: a.proof } : {}), iat: nowSec }
    const body = b64url(Buffer.from(JSON.stringify(s), 'utf8'))
    return { state: `${IG_STATE_PREFIX}${body}.${sign(body, master)}`, nonce }
}

/** 서명이 다르거나, 10분이 지났거나, 모양이 틀리면 null */
export function verifyIgState(state: string | null | undefined, master: Buffer, nowSec = Math.floor(Date.now() / 1000)): IgState | null {
    if (typeof state !== 'string' || !state.startsWith(IG_STATE_PREFIX)) return null
    const parts = state.slice(IG_STATE_PREFIX.length).split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    const [body, sig] = parts
    const want = Buffer.from(sign(body, master))
    const got = Buffer.from(sig)
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null
    try {
        const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<IgState>
        if (typeof s.u !== 'string' || !s.u || typeof s.m !== 'string' || !s.m || typeof s.n !== 'string' || !s.n) return null
        if ((s.src !== 'web' && s.src !== 'app') || typeof s.iat !== 'number') return null
        if (s.src === 'app' && !PROOF_RE.test(s.pr ?? '')) return null
        if (nowSec - s.iat > IG_STATE_MAX_AGE_SEC || nowSec < s.iat - 60) return null
        return { u: s.u, m: s.m, n: s.n, src: s.src, ...(s.src === 'app' ? { pr: s.pr } : {}), iat: s.iat }
    } catch {
        return null
    }
}

/** 사람을 보낼 인스타그램 로그인 주소 */
export function buildInstagramAuthUrl(cfg: InstagramConfig, state: string): string {
    const u = new URL(INSTAGRAM_AUTHORIZE_URL)
    u.searchParams.set('client_id', cfg.appId)
    u.searchParams.set('redirect_uri', cfg.redirectUri)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('scope', INSTAGRAM_SCOPE)
    u.searchParams.set('state', state)
    return u.toString()
}

/* ─────────────────────────── 메타 signed_request ─────────────────────────── */
// 연결 해제(deauthorize), 정보 삭제(data-deletion) 콜백이 보내는 값. "서명.본문" (둘 다 base64url), 서명 = HMAC-SHA256(본문, 앱 비밀값)

export function verifySignedRequest(raw: string | null | undefined, appSecret: string): { userId: string; issuedAt?: number } | null {
    const v = String(raw ?? '').trim()
    if (!v || !appSecret) return null
    const parts = v.split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    const [sig, body] = parts
    const want = createHmac('sha256', appSecret).update(body).digest()
    let got: Buffer
    try { got = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64') } catch { return null }
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null
    try {
        const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>
        if (String(p.algorithm ?? '').toUpperCase() !== 'HMAC-SHA256') return null
        const userId = typeof p.user_id === 'string' || typeof p.user_id === 'number' ? String(p.user_id) : ''
        if (!/^\d{1,40}$/.test(userId)) return null
        return { userId, ...(typeof p.issued_at === 'number' ? { issuedAt: p.issued_at } : {}) }
    } catch {
        return null
    }
}

/* ─────────────────────────── 게시물 → 자료 ─────────────────────────── */

export interface IgMedia { id: string; caption?: string | null; media_type?: string; permalink?: string | null; timestamp?: string | null }

/** 내 게시물 주소만 (instagram.com, https). 꼬리(?igsh=…)는 뗀다. 아니면 null */
export function cleanPermalink(raw: string | null | undefined): string | null {
    try {
        const u = new URL(String(raw ?? ''))
        const host = u.hostname.toLowerCase()
        if (u.protocol !== 'https:' || !(host === 'instagram.com' || host === 'www.instagram.com')) return null
        if (!/^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) return null
        return `https://www.instagram.com${u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`}`
    } catch {
        return null
    }
}

function isoOrUndef(t: string | null | undefined): string | undefined {
    const ms = Date.parse(String(t ?? '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'))
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

/**
 * 게시물 목록 → 자료 후보. 글(캡션)만 쓴다(사진, 영상은 내려받지 않는다).
 * 같은 게시물 번호는 한 번만. 글이 없거나 짧은 게시물은 빼고 short 로 센다.
 */
export function mediaToItems(media: IgMedia[]): { items: FeedItem[]; short: number } {
    const seen = new Set<string>()
    const items: FeedItem[] = []
    let short = 0
    for (const m of media) {
        if (!m || typeof m.id !== 'string' || seen.has(m.id)) continue
        seen.add(m.id)
        const url = cleanPermalink(m.permalink)
        if (!url) continue
        const caption = String(m.caption ?? '').replace(/\r\n?/g, '\n').trim()
        if (caption.length < INSTAGRAM_MIN_CAPTION) { short++; continue }
        const firstLine = caption.split('\n').find(l => l.trim())?.trim() ?? ''
        const title = (firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine) || '인스타그램 게시물'
        const publishedAt = isoOrUndef(m.timestamp)
        items.push({ title, url, text: caption.slice(0, INSTAGRAM_ITEM_MAX_CHARS), ...(publishedAt ? { publishedAt } : {}) })
    }
    return { items, short }
}

/* ─────────────────────────── 열쇠 연장 ─────────────────────────── */

export interface RefreshableRow { status: string; token_refreshed_at: string | null; token_expires_at: string | null }

/** 매일 크론이 연장할 열쇠인가: 연결 중 + 마지막 연장 뒤 24시간 + 15일 안에 끝남(이미 끝난 건 연장 불가 = 다시 연결) */
export function shouldRefresh(row: RefreshableRow, nowMs = Date.now()): boolean {
    if (row.status !== 'connected') return false
    const exp = Date.parse(String(row.token_expires_at ?? ''))
    if (!Number.isFinite(exp) || exp <= nowMs || exp - nowMs > REFRESH_WINDOW_MS) return false
    const last = Date.parse(String(row.token_refreshed_at ?? ''))
    return !Number.isFinite(last) || nowMs - last >= REFRESH_MIN_AGE_MS
}

/** 프로페셔널 계정(비즈니스, 크리에이터)인가 */
export function isProfessional(accountType: string | null | undefined): boolean {
    return ['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(String(accountType ?? '').toUpperCase())
}
