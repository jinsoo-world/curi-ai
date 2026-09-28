// 큐리어스 연결(읽기만)  -  허용 목록, 응답 읽기, 401 처리. 가짜 fetch 로 인터넷 없이 확인한다.
import { describe, it, expect } from 'vitest'
import {
    CuriousAuthExpired, CuriousApiError, curiousGet, curiousMyStudies, curiousStudiesToText, isCuriousPathAllowed,
    parseMembers, parsePosts,
} from '../curious'
import { buildAuthUrl } from '../oauth'
import { findProvider, CURIOUS_PARTNER_API } from '../providers'

const 가짜fetch = (status: number, body: unknown, seen: string[] = []) =>
    (async (url: string | URL | Request, init?: RequestInit) => {
        seen.push(`${init?.method ?? 'GET'} ${String(url)}`)
        return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch

describe('큐리어스 허용 목록', () => {
    it('읽기 4줄만 열려 있다', () => {
        expect(isCuriousPathAllowed('/me')).toBe(true)
        expect(isCuriousPathAllowed('/studies')).toBe(true)
        expect(isCuriousPathAllowed('/studies/12/members')).toBe(true)
        expect(isCuriousPathAllowed('/posts')).toBe(true)
    })
    it('정산, 결제, 관리자, 공개 전환, 남의 정보는 닫혀 있다', () => {
        for (const p of ['/settlements', '/payments', '/admin/users', '/studies/1/status', '/users/3', '/studies/1', '/studies/../admin', '/raw-query']) {
            expect(isCuriousPathAllowed(p)).toBe(false)
        }
    })
    it('목록 밖 주소는 fetch 전에 막는다', async () => {
        const seen: string[] = []
        await expect(curiousGet('t', '/payments', {}, 가짜fetch(200, {}, seen))).rejects.toThrow()
        expect(seen).toHaveLength(0)
    })
})

describe('큐리어스 부르기', () => {
    it('GET 으로 partner 창구를 부르고, Bearer 토큰을 쓴다', async () => {
        const seen: string[] = []
        const studies = await curiousMyStudies('tok', 가짜fetch(200, { items: [
            { id: 7, title: '가족 영상 앨범', role: 'leader', visibility: 'PRIVATE', price: 0, capacity: 100, applicantCount: 42, nextSessionAt: '2026-10-14T20:00:00+09:00', url: 'https://curious-500.com/v2/study/7' },
            { title: '번호 없는 것은 버린다' },
        ] }, seen))
        expect(seen[0]).toBe(`GET ${CURIOUS_PARTNER_API}/studies?role=all&limit=10`)
        expect(studies).toHaveLength(1)
        expect(studies[0]).toMatchObject({ id: 7, role: 'leader', applicantCount: 42 })
        const text = curiousStudiesToText(studies)
        expect(text).toContain('가족 영상 앨범 (번호 7)')
        expect(text).toContain('무료')
        expect(text).toContain('신청 42명 / 정원 100명')
    })
    it('401 은 로그인 끊김, 그 밖의 실패는 상태 번호만', async () => {
        await expect(curiousGet('t', '/me', {}, 가짜fetch(401, {}))).rejects.toBeInstanceOf(CuriousAuthExpired)
        await expect(curiousGet('t', '/me', {}, 가짜fetch(500, { secret: 'x' }))).rejects.toBeInstanceOf(CuriousApiError)
    })
    it('멤버는 별명과 들어온 날만, 글은 500자까지만 읽는다', () => {
        const m = parseMembers({ total: 2, items: [{ nickname: '봄날', joinedAt: '2026-09-01', phone: '010-0000-0000', email: 'a@b.c' }] })
        expect(m.total).toBe(2)
        expect(JSON.stringify(m)).not.toContain('010')
        expect(JSON.stringify(m)).not.toContain('a@b.c')
        const posts = parsePosts({ items: [{ id: 1, title: '후기', excerpt: '가'.repeat(900) }] })
        expect(posts[0].excerpt).toHaveLength(500)
    })
    it('로그인 주소는 명세대로 PKCE, 읽기 권한 4개', () => {
        const u = new URL(buildAuthUrl(findProvider('curious')!, { clientId: 'c', redirectUri: 'https://www.curi-ai.com/api/connect/curious/callback', state: 's', challenge: 'ch' }))
        expect(u.origin + u.pathname).toBe('https://curious-500.com/oauth/authorize')
        expect(u.searchParams.get('scope')).toBe('profile:read studies:read members:read posts:read')
        expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    })
})
