// 인스타그램 API 부르기 — 코드 교환(짧은 열쇠 → 60일 열쇠 → 프로필), 연장, 내 게시물 목록. fetch 는 가짜
import { describe, it, expect, vi } from 'vitest'
import {
    completeInstagramLogin, refreshLongLivedToken, fetchOwnMedia, InstagramApiError, NotProfessionalAccount, IG_FETCH_TIMEOUT_MS,
} from '../api'

const cfg = { appId: '123', appSecret: 'sek', redirectUri: 'https://www.curi-ai.com/api/sns/instagram/callback' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Call = { url: string; init?: RequestInit }
function fakeFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
    const calls: Call[] = []
    const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input)
        calls.push({ url, init })
        return handler(new URL(url), init)
    }) as unknown as typeof fetch
    return { f, calls }
}

describe('completeInstagramLogin', () => {
    it('코드 → 짧은 열쇠 → 60일 열쇠 → 프로필', async () => {
        const now = Date.parse('2026-10-07T00:00:00Z')
        const { f, calls } = fakeFetch((u, init) => {
            if (u.href === 'https://api.instagram.com/oauth/access_token') {
                const b = new URLSearchParams(String(init?.body))
                expect(init?.method).toBe('POST')
                expect(Object.fromEntries(b)).toEqual({ client_id: '123', client_secret: 'sek', grant_type: 'authorization_code', redirect_uri: cfg.redirectUri, code: 'CODE' })
                return json({ data: [{ access_token: 'SHORT', user_id: 777, permissions: 'instagram_business_basic' }] })
            }
            if (u.pathname === '/access_token') {
                expect(u.searchParams.get('grant_type')).toBe('ig_exchange_token')
                expect(u.searchParams.get('client_secret')).toBe('sek')
                expect(u.searchParams.get('access_token')).toBe('SHORT')
                return json({ access_token: 'LONG', token_type: 'bearer', expires_in: 5184000 })
            }
            if (u.pathname === '/me') {
                expect(u.searchParams.get('access_token')).toBe('LONG')
                expect(u.searchParams.get('fields')).toBe('id,user_id,username,account_type')
                return json({ id: '777', user_id: '17841400000', username: 'jin.ceo', account_type: 'MEDIA_CREATOR' })
            }
            return json({}, 404)
        })
        const r = await completeInstagramLogin(cfg, 'CODE', { fetchImpl: f, nowMs: now })
        expect(r).toEqual({
            accessToken: 'LONG', expiresAt: new Date(now + 5184000_000).toISOString(),
            igUserId: '17841400000', igScopedId: '777', username: 'jin.ceo', accountType: 'MEDIA_CREATOR',
        })
        expect(calls).toHaveLength(3)
        for (const c of calls) expect(c.init?.signal).toBeInstanceOf(AbortSignal)
    })

    it('옛 모양 응답(data 없이 바로)도 받는다', async () => {
        const { f } = fakeFetch(u => {
            if (u.hostname === 'api.instagram.com') return json({ access_token: 'SHORT', user_id: 1 })
            if (u.pathname === '/access_token') return json({ access_token: 'LONG', expires_in: 100 })
            return json({ id: '1', user_id: '2', username: 'a', account_type: 'BUSINESS' })
        })
        expect((await completeInstagramLogin(cfg, 'C', { fetchImpl: f })).accessToken).toBe('LONG')
    })

    it('개인 계정이면 NotProfessionalAccount', async () => {
        const { f } = fakeFetch(u => {
            if (u.hostname === 'api.instagram.com') return json({ access_token: 'S', user_id: 1 })
            if (u.pathname === '/access_token') return json({ access_token: 'L', expires_in: 100 })
            return json({ id: '1', user_id: '2', username: 'a', account_type: 'PERSONAL' })
        })
        await expect(completeInstagramLogin(cfg, 'C', { fetchImpl: f })).rejects.toBeInstanceOf(NotProfessionalAccount)
    })

    it('교환 실패는 InstagramApiError(토큰 글자는 메시지에 없다)', async () => {
        const { f } = fakeFetch(() => json({ error_type: 'OAuthException', code: 400, error_message: 'Invalid code SECRETCODE' }, 400))
        const e = await completeInstagramLogin(cfg, 'SECRETCODE', { fetchImpl: f }).catch(x => x)
        expect(e).toBeInstanceOf(InstagramApiError)
        expect(String(e.message)).not.toContain('SECRETCODE')
    })

    it('시간 한도가 걸려 있다', () => {
        expect(IG_FETCH_TIMEOUT_MS).toBeGreaterThan(0)
        expect(IG_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(15_000)
    })
})

describe('refreshLongLivedToken', () => {
    it('ig_refresh_token 로 새 열쇠와 끝나는 시각', async () => {
        const now = 1_000_000
        const { f } = fakeFetch(u => {
            expect(u.href.startsWith('https://graph.instagram.com/refresh_access_token?')).toBe(true)
            expect(u.searchParams.get('grant_type')).toBe('ig_refresh_token')
            expect(u.searchParams.get('access_token')).toBe('OLD')
            return json({ access_token: 'NEW', token_type: 'bearer', expires_in: 5184000 })
        })
        expect(await refreshLongLivedToken('OLD', { fetchImpl: f, nowMs: now })).toEqual({ accessToken: 'NEW', expiresAt: new Date(now + 5184000_000).toISOString() })
    })
    it('190(열쇠 무효)이면 tokenInvalid', async () => {
        const { f } = fakeFetch(() => json({ error: { message: 'Error validating access token', type: 'OAuthException', code: 190 } }, 400))
        const e = await refreshLongLivedToken('OLD', { fetchImpl: f }).catch(x => x)
        expect(e).toBeInstanceOf(InstagramApiError)
        expect(e.tokenInvalid).toBe(true)
    })
    it('그 밖의 고장은 tokenInvalid 아님', async () => {
        const { f } = fakeFetch(() => json({ error: { message: 'busy', code: 2 } }, 500))
        const e = await refreshLongLivedToken('OLD', { fetchImpl: f }).catch(x => x)
        expect(e.tokenInvalid).toBe(false)
    })
})

describe('fetchOwnMedia', () => {
    const page = (ids: number[], next?: string) => json({
        data: ids.map(i => ({ id: String(i), caption: `게시물 ${i}`, media_type: 'IMAGE', permalink: `https://www.instagram.com/p/P${i}/`, timestamp: `2026-10-0${(i % 9) + 1}T00:00:00+0000` })),
        ...(next ? { paging: { next } } : {}),
    })

    it('다음 쪽을 따라가고 최대 개수에서 멈춘다', async () => {
        const { f, calls } = fakeFetch(u => {
            const after = u.searchParams.get('after')
            if (!after) {
                expect(u.pathname).toBe('/me/media')
                expect(u.searchParams.get('fields')).toBe('id,caption,media_type,permalink,timestamp')
                return page([1, 2, 3], 'https://graph.instagram.com/v23.0/17841/media?access_token=T&after=A&limit=25')
            }
            return page([4, 5, 6], 'https://graph.instagram.com/v23.0/17841/media?access_token=T&after=B&limit=25')
        })
        const r = await fetchOwnMedia('T', { max: 5, fetchImpl: f })
        expect(r.media.map(m => m.id)).toEqual(['1', '2', '3', '4', '5'])
        expect(r.complete).toBe(false)
        expect(calls).toHaveLength(2)
    })

    it('stopAt 이 참이면 거기서 끝(끝까지 본 것으로 친다)', async () => {
        const { f } = fakeFetch(() => page([1, 2, 3], 'https://graph.instagram.com/next?after=x'))
        const r = await fetchOwnMedia('T', { max: 60, fetchImpl: f, stopAt: m => m.id === '2' })
        expect(r.media.map(m => m.id)).toEqual(['1'])
        expect(r.complete).toBe(true)
    })

    it('다음 쪽이 없으면 complete', async () => {
        const { f } = fakeFetch(() => page([1]))
        expect((await fetchOwnMedia('T', { max: 60, fetchImpl: f })).complete).toBe(true)
    })

    it('다음 쪽 주소가 graph.instagram.com 이 아니면 따라가지 않는다(열쇠가 새지 않게)', async () => {
        const { f, calls } = fakeFetch(() => page([1], 'https://evil.example.com/steal?access_token=T'))
        const r = await fetchOwnMedia('T', { max: 60, fetchImpl: f })
        expect(calls).toHaveLength(1)
        expect(r.complete).toBe(false)
    })

    it('190 은 tokenInvalid 로 던진다', async () => {
        const { f } = fakeFetch(() => json({ error: { code: 190, message: 'expired' } }, 400))
        await expect(fetchOwnMedia('T', { max: 60, fetchImpl: f })).rejects.toMatchObject({ tokenInvalid: true })
    })

    it('마감이 지나면 더 부르지 않는다', async () => {
        const { f, calls } = fakeFetch(() => page([1], 'https://graph.instagram.com/next?after=x'))
        const r = await fetchOwnMedia('T', { max: 60, fetchImpl: f, deadline: Date.now() - 1 })
        expect(calls).toHaveLength(0)
        expect(r.complete).toBe(false)
    })
})
