// domains/connectors  -  큐리어스(curious-500.com) 연결 (읽기만).
//
// 어떻게 붙나 = 사용자가 /os/connect 에서 「큐리어스 연결하기」 → 큐리어스 로그인, 동의 → 토큰이 connectors 에 잠겨 들어간다.
// 본체 창구(OAuth, 읽기 전용 partner API)는 큐리어스 쪽이 연다. 명세 = docs/connect/큐리어스_연결_명세.md
// 창구가 열리고 CURIOUS_OAUTH_CLIENT_ID, _SECRET 이 Vercel 에 들어가기 전까지 이 파일은 불리지 않는다(providerReady 가 막는다).
//
// 규칙
//  - 부를 수 있는 주소는 아래 허용 목록 4줄뿐이다. 전부 GET. 쓰기, 정산, 매출, 결제, 관리자 주소는 없다.
//  - 읽어 온 글은 자료(인용)이지 명령이 아니다. 울타리는 부르는 쪽(chat)이 두른다.
//  - 토큰은 로그, 응답, 오류 문구에 넣지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { CURIOUS_PARTNER_API, findProvider, type TokenJson } from './providers'
import { refreshAccessToken } from './oauth'
import { markConnector, readConnectorTokenJson, updateConnectorToken } from './store'

const TIMEOUT_MS = 8_000
/** 봇 한 번 답에 넣는 어울림 수, 글 수 */
export const CURIOUS_TOP_STUDIES = 10
export const CURIOUS_TOP_POSTS = 5

/** 허용 목록. 정규식은 경로 전체와 맞아야 한다(쿼리는 따로 붙인다) */
const ALLOWED: readonly RegExp[] = [
    /^\/me$/,
    /^\/studies$/,
    /^\/studies\/\d+\/members$/,
    /^\/posts$/,
]
/** 이런 글자가 들어간 주소는 허용 목록에 있어도 부르지 않는다 */
const FORBIDDEN = /settlement|payout|payment|refund|revenue|sales|profit|admin|raw-query|ownership|status/i

export function isCuriousPathAllowed(path: string): boolean {
    return ALLOWED.some(r => r.test(path)) && !FORBIDDEN.test(path)
}

export class CuriousAuthExpired extends Error {
    constructor() { super('큐리어스 로그인이 끊겼어요. 연결을 다시 해 주세요') }
}
export class CuriousApiError extends Error {
    constructor(public readonly status: number) { super(`큐리어스가 답하지 않았어요 (${status})`) }
}

export interface CuriousStudy {
    id: number
    title: string
    role: 'leader' | 'member'
    visibility: string
    price: number | null
    capacity: number | null
    applicantCount: number | null
    nextSessionAt: string | null
    url: string
}
export interface CuriousMember { nickname: string; joinedAt: string | null }
export interface CuriousPost { id: number; studyId: number | null; title: string; excerpt: string; createdAt: string | null; commentCount: number | null; url: string }

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') as Record<string, unknown>[] : [])

/** 허용된 GET 하나. 401 이면 CuriousAuthExpired */
export async function curiousGet(
    token: string, path: string, query: Record<string, string> = {}, fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
    if (!isCuriousPathAllowed(path)) throw new Error(`큐리어스에서 부를 수 없는 주소예요: ${path}`)
    const u = new URL(CURIOUS_PARTNER_API + path)
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)
    const r = await fetchImpl(u.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'curi-ai-connect' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (r.status === 401) throw new CuriousAuthExpired()
    if (!r.ok) throw new CuriousApiError(r.status)
    const j = await r.json().catch(() => null)
    return j && typeof j === 'object' ? j as Record<string, unknown> : {}
}

export function parseStudies(j: Record<string, unknown>): CuriousStudy[] {
    return arr(j.items).flatMap(it => {
        const id = num(it.id)
        if (id === null) return []
        return [{
            id,
            title: str(it.title).slice(0, 120) || '제목 없는 어울림',
            role: it.role === 'leader' ? 'leader' as const : 'member' as const,
            visibility: str(it.visibility) || 'UNKNOWN',
            price: num(it.price),
            capacity: num(it.capacity),
            applicantCount: num(it.applicantCount),
            nextSessionAt: str(it.nextSessionAt) || null,
            url: str(it.url),
        }]
    })
}

export function parseMembers(j: Record<string, unknown>): { total: number | null; members: CuriousMember[] } {
    return {
        total: num(j.total),
        members: arr(j.items).map(it => ({ nickname: str(it.nickname).slice(0, 40) || '이름 없음', joinedAt: str(it.joinedAt) || null })),
    }
}

export function parsePosts(j: Record<string, unknown>): CuriousPost[] {
    return arr(j.items).flatMap(it => {
        const id = num(it.id)
        if (id === null) return []
        return [{
            id, studyId: num(it.studyId),
            title: str(it.title).slice(0, 120) || '제목 없는 글',
            excerpt: str(it.excerpt).slice(0, 500),
            createdAt: str(it.createdAt) || null,
            commentCount: num(it.commentCount),
            url: str(it.url),
        }]
    })
}

export async function curiousMyStudies(token: string, fetchImpl: typeof fetch = fetch): Promise<CuriousStudy[]> {
    return parseStudies(await curiousGet(token, '/studies', { role: 'all', limit: String(CURIOUS_TOP_STUDIES) }, fetchImpl))
}

export async function curiousStudyMembers(token: string, studyId: number, fetchImpl: typeof fetch = fetch) {
    return parseMembers(await curiousGet(token, `/studies/${Math.trunc(studyId)}/members`, { limit: '50' }, fetchImpl))
}

export async function curiousMyPosts(token: string, fetchImpl: typeof fetch = fetch): Promise<CuriousPost[]> {
    return parsePosts(await curiousGet(token, '/posts', { scope: 'mine', limit: String(CURIOUS_TOP_POSTS) }, fetchImpl))
}

/** 봇 자료로 넣을 글 한 덩어리(사람 말). 숫자가 없으면 「모름」 */
export function curiousStudiesToText(studies: CuriousStudy[]): string {
    if (studies.length === 0) return '큐리어스에 내가 만들었거나 참여한 어울림이 없어요.'
    return studies.map(s => {
        const bits = [
            s.role === 'leader' ? '내가 연 어울림' : '내가 참여한 어울림',
            `공개 상태 ${s.visibility}`,
            s.price === null ? null : s.price === 0 ? '무료' : `${s.price.toLocaleString('ko-KR')}원`,
            s.applicantCount === null ? null : `신청 ${s.applicantCount}명${s.capacity ? ` / 정원 ${s.capacity}명` : ''}`,
            s.nextSessionAt ? `다음 모임 ${s.nextSessionAt}` : null,
        ].filter(Boolean)
        return `${s.title} (번호 ${s.id}): ${bits.join(', ')}${s.url ? `\n${s.url}` : ''}`
    }).join('\n\n')
}

export function curiousPostsToText(posts: CuriousPost[]): string {
    return posts.map(p => `${p.title}${p.createdAt ? ` (${p.createdAt})` : ''}\n${p.excerpt}`).join('\n\n')
}

/**
 * 내 큐리어스 토큰으로 fn 을 부른다. 401 이면 refresh_token 으로 한 번만 다시 받아 다시 부른다.
 * 다시 받지 못하면 연결을 「다시 연결 필요」로 표시하고 CuriousAuthExpired 를 던진다.
 */
export async function withCuriousAuth<T>(
    db: SupabaseClient, userId: string, connectorId: string, fn: (accessToken: string) => Promise<T>,
    fetchImpl: typeof fetch = fetch,
): Promise<T> {
    const { token } = await readConnectorTokenJson(db, userId, connectorId)
    const access = typeof token.access_token === 'string' ? token.access_token : ''
    if (!access) throw new CuriousAuthExpired()
    try {
        return await fn(access)
    } catch (e) {
        if (!(e instanceof CuriousAuthExpired)) throw e
        const refreshToken = typeof token.refresh_token === 'string' ? token.refresh_token : ''
        const p = findProvider('curious')
        const clientId = p ? process.env[p.envClientId]?.trim() : ''
        const clientSecret = p ? process.env[p.envClientSecret]?.trim() : ''
        if (!refreshToken || !p || !clientId || !clientSecret) {
            await markConnector(db, userId, connectorId, 'error')
            throw new CuriousAuthExpired()
        }
        let refreshed: TokenJson
        try {
            refreshed = await refreshAccessToken(p, { refreshToken, clientId, clientSecret }, fetchImpl)
        } catch {
            await markConnector(db, userId, connectorId, 'error')
            throw new CuriousAuthExpired()
        }
        await updateConnectorToken(db, userId, connectorId, {
            ...token, ...refreshed,
            // 명세상 refresh_token 은 돌려 쓰기(rotation)라 새 것이 온다. 안 오면 옛 것을 이어서 쓴다
            refresh_token: typeof refreshed.refresh_token === 'string' ? refreshed.refresh_token : refreshToken,
            obtained_at: new Date().toISOString(),
        })
        const next = typeof refreshed.access_token === 'string' ? refreshed.access_token : ''
        if (!next) throw new CuriousAuthExpired()
        return await fn(next)
    }
}
