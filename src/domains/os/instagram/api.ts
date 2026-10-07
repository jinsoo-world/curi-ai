// 인스타그램 API 부르기 (Instagram API with Instagram Login). 서버 전용.
//
//   1. 코드 → 짧은 열쇠     POST https://api.instagram.com/oauth/access_token
//   2. 짧은 → 60일 열쇠     GET  https://graph.instagram.com/access_token?grant_type=ig_exchange_token
//   3. 프로필               GET  https://graph.instagram.com/me?fields=id,user_id,username,account_type
//   4. 내 게시물            GET  https://graph.instagram.com/me/media?fields=id,caption,media_type,permalink,timestamp
//   5. 열쇠 연장            GET  https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token
//
// 🔐 열쇠가 든 주소, 응답 본문은 로그에 남기지 않는다. 오류 메시지에는 상태 번호와 메타 오류 번호만.
// 모든 요청에 시간 한도(IG_FETCH_TIMEOUT_MS).

import type { InstagramConfig, IgMedia } from './core'
import { INSTAGRAM_MAX_MEDIA, isProfessional } from './core'

export const IG_FETCH_TIMEOUT_MS = 10_000
const GRAPH = 'https://graph.instagram.com'
const MEDIA_FIELDS = 'id,caption,media_type,permalink,timestamp'
const PAGE_LIMIT = 25

export class InstagramApiError extends Error {
    /** 메타 오류 190 = 열쇠가 끝났거나 취소됨 → 다시 연결 필요 */
    readonly tokenInvalid: boolean
    constructor(public readonly status: number, public readonly code: number | null, where: string) {
        super(`인스타그램 ${where} 실패 (${status}${code !== null ? `/${code}` : ''})`)
        this.tokenInvalid = code === 190
    }
}

export class NotProfessionalAccount extends Error {
    constructor() { super('프로페셔널 계정이 아니다') }
}

interface CallOpts { fetchImpl?: typeof fetch; nowMs?: number }

async function call(url: string, where: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
    let r: Response
    try {
        r = await fetchImpl(url, { ...init, headers: { Accept: 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(IG_FETCH_TIMEOUT_MS), cache: 'no-store' })
    } catch {
        throw new InstagramApiError(0, null, where)
    }
    const j = await r.json().catch(() => null) as Record<string, unknown> | null
    const err = j && typeof j.error === 'object' && j.error ? j.error as Record<string, unknown> : null
    const code = typeof err?.code === 'number' ? err.code : typeof j?.code === 'number' && !r.ok ? j.code as number : null
    if (!r.ok || err || !j) throw new InstagramApiError(r.status, code, where)
    return j
}

function expiryIso(expiresIn: unknown, nowMs: number): string {
    const sec = typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 60 * 24 * 3600
    return new Date(nowMs + sec * 1000).toISOString()
}

export interface InstagramLogin {
    accessToken: string
    expiresAt: string
    /** 프로페셔널 계정 번호 (/me user_id) */
    igUserId: string
    /** 앱 범위 번호 (/me id, 연결 해제·삭제 콜백의 user_id 와 같을 수 있다) */
    igScopedId: string
    username: string
    accountType: string
}

/** 돌아온 code → 60일 열쇠 + 프로필. 개인 계정이면 NotProfessionalAccount */
export async function completeInstagramLogin(cfg: InstagramConfig, code: string, o: CallOpts = {}): Promise<InstagramLogin> {
    const f = o.fetchImpl ?? fetch
    const body = new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, grant_type: 'authorization_code', redirect_uri: cfg.redirectUri, code })
    const s = await call('https://api.instagram.com/oauth/access_token', '코드 교환', {
        method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }, f)
    const first = Array.isArray(s.data) ? (s.data[0] ?? {}) as Record<string, unknown> : s
    const short = typeof first.access_token === 'string' ? first.access_token : ''
    if (!short) throw new InstagramApiError(200, null, '코드 교환')

    const long = new URL(`${GRAPH}/access_token`)
    long.searchParams.set('grant_type', 'ig_exchange_token')
    long.searchParams.set('client_secret', cfg.appSecret)
    long.searchParams.set('access_token', short)
    const l = await call(long.toString(), '60일 열쇠', {}, f)
    const accessToken = typeof l.access_token === 'string' ? l.access_token : ''
    if (!accessToken) throw new InstagramApiError(200, null, '60일 열쇠')

    const me = new URL(`${GRAPH}/me`)
    me.searchParams.set('fields', 'id,user_id,username,account_type')
    me.searchParams.set('access_token', accessToken)
    const p = await call(me.toString(), '프로필', {}, f)
    const igUserId = String(p.user_id ?? p.id ?? '')
    const username = typeof p.username === 'string' ? p.username : ''
    if (!/^\d{1,40}$/.test(igUserId) || !/^[A-Za-z0-9._]{1,30}$/.test(username)) throw new InstagramApiError(200, null, '프로필')
    const accountType = String(p.account_type ?? '')
    if (!isProfessional(accountType)) throw new NotProfessionalAccount()
    const scoped = String(p.id ?? first.user_id ?? igUserId)
    return {
        accessToken, expiresAt: expiryIso(l.expires_in, o.nowMs ?? Date.now()),
        igUserId, igScopedId: /^\d{1,40}$/.test(scoped) ? scoped : igUserId, username, accountType: accountType.toUpperCase(),
    }
}

/** 60일 열쇠 연장 (24시간 지난 열쇠만 된다) */
export async function refreshLongLivedToken(token: string, o: CallOpts = {}): Promise<{ accessToken: string; expiresAt: string }> {
    const u = new URL(`${GRAPH}/refresh_access_token`)
    u.searchParams.set('grant_type', 'ig_refresh_token')
    u.searchParams.set('access_token', token)
    const j = await call(u.toString(), '열쇠 연장', {}, o.fetchImpl ?? fetch)
    const accessToken = typeof j.access_token === 'string' ? j.access_token : ''
    if (!accessToken) throw new InstagramApiError(200, null, '열쇠 연장')
    return { accessToken, expiresAt: expiryIso(j.expires_in, o.nowMs ?? Date.now()) }
}

/**
 * 내 게시물 (최신순). 다음 쪽(paging.next)은 graph.instagram.com 일 때만 따라간다.
 * stopAt(게시물)이 참이면 그 앞까지만 돌려주고 끝까지 본 것으로 친다(complete).
 * complete = 더 볼 게시물이 없다(또는 stopAt 에 닿았다). 개수, 마감에 걸리면 false.
 */
export async function fetchOwnMedia(
    token: string,
    o: { max?: number; stopAt?: (m: IgMedia) => boolean; deadline?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ media: IgMedia[]; complete: boolean }> {
    const max = o.max ?? INSTAGRAM_MAX_MEDIA
    const media: IgMedia[] = []
    const first = new URL(`${GRAPH}/me/media`)
    first.searchParams.set('fields', MEDIA_FIELDS)
    first.searchParams.set('limit', String(PAGE_LIMIT))
    first.searchParams.set('access_token', token)
    let next: string | null = first.toString()
    while (next) {
        if (media.length >= max) return { media, complete: false }
        if (o.deadline && Date.now() > o.deadline - 2_000) return { media, complete: false }
        const j = await call(next, '게시물 목록', {}, o.fetchImpl ?? fetch)
        const list = Array.isArray(j.data) ? j.data as IgMedia[] : []
        for (const m of list) {
            if (!m || typeof m.id !== 'string') continue
            if (o.stopAt?.(m)) return { media, complete: true }
            if (media.length >= max) return { media, complete: false }
            media.push(m)
        }
        const paging = (j.paging ?? {}) as Record<string, unknown>
        const n = typeof paging.next === 'string' ? paging.next : null
        if (!n) return { media, complete: true }
        let ok = false
        try { const u = new URL(n); ok = u.protocol === 'https:' && u.hostname === 'graph.instagram.com' } catch { ok = false }
        if (!ok) return { media, complete: false }
        next = n
    }
    return { media, complete: true }
}
