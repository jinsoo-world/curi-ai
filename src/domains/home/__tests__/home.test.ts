import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { homeLinkGuide, isMarketHost } from '../link-guide'
import { HOME_DRAFT_KEY, HOME_DRAFT_TTL_MS, clearHomeDraft, readHomeDraft, saveHomeDraft } from '../draft-store'
import { HOME_FEED_CONFIG, agoText, buildHomeFeed, categoryOf, gateStats, josa, maskName, selfMadeBots, type HomeActivityRow } from '../feed'
import { HOME_COPY, homeStatsLine } from '../copy'
import { classifySnsLink } from '@/domains/os/sns-link'
import { draftLinkKind } from '@/domains/os/twin-draft-shared'

function mem() {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, m }
}

describe('homeLinkGuide', () => {
    it.each([
        ['https://www.youtube.com/@curi', 'youtube'],
        ['abc.tistory.com', 'tistory'],
        ['https://blog.naver.com/abc', 'feed'],
        ['brunch.co.kr/@abc', 'feed'],
        ['https://www.instagram.com/abc', 'capture'],
        ['threads.net/@abc', 'capture'],
        ['https://smartstore.naver.com/shop/products/123', 'market'],
        ['https://www.coupang.com/vp/products/1', 'market'],
        ['https://myshop.co.kr/product/detail.html?id=3', 'shop'],
        ['https://abc.substack.com', 'feed'],
        ['https://example.com/feed', 'feed'],
        ['https://example.com', 'web'],
        ['@curi_ai', 'bareId'],
        ['curi_ai', 'bareId'],
        ['아무말 대잔치', 'bad'],
        ['', 'bad'],
    ])('%s → %s', (raw, kind) => {
        expect(homeLinkGuide(raw).kind).toBe(kind)
    })
    it('asks for paste on paste, capture, market', () => {
        expect(homeLinkGuide('blog.naver.com/a').needPaste).toBe(false)   // 대표 결정 0929: 네이버 블로그는 다시 자동으로 읽는다
        expect(homeLinkGuide('instagram.com/a').needPaste).toBe(false)   // 1005: 인스타그램, 스레드도 공개 글은 읽는다 (못 읽으면 같은 화면에 붙여넣기 칸)
        expect(homeLinkGuide('facebook.com/a').needPaste).toBe(true)
        expect(homeLinkGuide('coupang.com/vp/1').needPaste).toBe(true)
        expect(homeLinkGuide('youtube.com/@a').needPaste).toBe(false)
    })
    it('bare id has no url yet', () => { expect(homeLinkGuide('@abc').url).toBeNull() })
    it('market host matching', () => {
        expect(isMarketHost('m.smartstore.naver.com')).toBe(true)
        expect(isMarketHost('myshop.co.kr')).toBe(false)
    })
    it('server classifier keeps market links link-only', async () => {
        const t = await classifySnsLink('https://smartstore.naver.com/shop/products/1')
        expect(t && 'platform' in t ? t.platform : null).toBe('market')
        expect(draftLinkKind('https://www.coupang.com/vp/products/1')).toBe('paste')
    })
})

describe('draft store', () => {
    it('saves, reads, clears', () => {
        const s = mem()
        expect(saveHomeDraft(s, { links: [' https://a.com ', '', 'b.com', 'c.com', 'd.com'], pastes: ['  ', 'hello'], consents: [true, true] }, 1000)).toBe(true)
        const d = readHomeDraft(s, 2000)
        expect(d?.links).toEqual(['https://a.com', 'b.com', 'c.com'])
        expect(d?.pastes).toEqual(['hello'])
        clearHomeDraft(s)
        expect(s.m.has(HOME_DRAFT_KEY)).toBe(false)
    })
    it('drops after a day and ignores junk', () => {
        const s = mem()
        saveHomeDraft(s, { links: ['a.com'], pastes: [], consents: [] }, 0)
        expect(readHomeDraft(s, HOME_DRAFT_TTL_MS + 1)).toBeNull()
        s.setItem(HOME_DRAFT_KEY, '{bad')
        expect(readHomeDraft(s, 1)).toBeNull()
        expect(readHomeDraft(null)).toBeNull()
    })
})

describe('home feed (real data)', () => {
    const now = Date.parse('2026-09-29T00:00:00Z')
    const row = (i: number, kind: HomeActivityRow['kind'] = 'made', minsAgo = 10): HomeActivityRow => ({ kind, userId: `u${i}`, at: new Date(now - minsAgo * 60_000).toISOString(), category: '홍보팀장' })
    const names = new Map([['u1', '김철수'], ['u2', 'kim@x.com']])

    it('masks names', () => {
        expect(maskName('김철수')).toBe('김**님')
        expect(maskName('a@b.com')).toBe('누군가')
        expect(maskName('')).toBe('누군가')
    })
    it('ago text', () => {
        expect(agoText(now - 10_000, now)).toBe('방금')
        expect(agoText(now - 5 * 60_000, now)).toBe('5분 전')
        expect(agoText(now - 3 * 3600_000, now)).toBe('3시간 전')
    })
    it('hides everything below the threshold (no fake rows)', () => {
        expect(buildHomeFeed([row(1), row(2), row(3)], names, now)).toEqual([])
        expect(buildHomeFeed([], names, now)).toEqual([])
    })
    it('same person same kind counts once', () => {
        const rows = Array.from({ length: 10 }, (_, i) => row(1, 'chat', i + 1))
        expect(buildHomeFeed(rows, names, now)).toEqual([])
    })
    it('shows masked lines above the threshold, newest first, no bot names', () => {
        const rows = Array.from({ length: HOME_FEED_CONFIG.minPeople24h }, (_, i) => row(i + 1, 'made', i + 1))
        const feed = buildHomeFeed(rows, names, now)
        expect(feed.length).toBe(rows.length)
        expect(feed[0].text).toBe('김**님이 홍보팀장을 만들었어요')
        expect(feed[0].ago).toBe('1분 전')
    })
    it('drops rows older than 7 days', () => {
        const rows = [...Array.from({ length: 5 }, (_, i) => row(i + 1)), row(9, 'made', 8 * 24 * 60)]
        expect(buildHomeFeed(rows, names, now).length).toBe(5)
    })
    it('category and particles', () => {
        expect(categoryOf({ role: 'twin' })).toBe('나를 닮은 AI')
        expect(categoryOf({ oneLiner: '알리는 글과 답장 초안을 써요' })).toBe('홍보팀장')
        expect(categoryOf({ marketCategory: '유튜브' })).toBe('유튜브 AI')
        expect(categoryOf({})).toBe('AI 팀원')
        expect(josa('나를 닮은 AI', '을', '를')).toBe('나를 닮은 AI를')
        expect(josa('홍보팀장', '을', '를')).toBe('홍보팀장을')
    })
    it('excludes default team and market bots', () => {
        const t0 = '2026-09-20T00:00:00Z'
        const b = (u: string, at: string, linked = false) => ({ user_id: u, role: 'helper', one_liner: null, created_at: at, linked_from_market: linked })
        const out = selfMadeBots([b('u1', t0), b('u1', '2026-09-20T00:00:05Z'), b('u1', '2026-09-21T00:00:00Z'), b('u1', '2026-09-22T00:00:00Z', true)])
        expect(out.map(x => x.created_at)).toEqual(['2026-09-21T00:00:00Z'])
    })
    it('stats hidden below threshold', () => {
        expect(gateStats({ bots: 3, chats: 50 })).toEqual({ bots: null, chats: null })
        expect(homeStatsLine({ bots: null, chats: null })).toBe('')
        expect(homeStatsLine(gateStats({ bots: 150, chats: 20 }))).toBe('지금까지 큐리AI에서 만든 봇 150개')
    })
})

describe('no dummy data on /home (대표 지시 1003)', () => {
    it('page uses only the real loader, never example data', () => {
        const src = readFileSync('src/app/home/page.tsx', 'utf8')
        expect(src).toContain('loadHomeActivity')
        expect(src).not.toMatch(/DUMMY|feed-dummy|예시 데이터/)
        expect(existsSync('src/domains/home/feed-dummy.ts')).toBe(false)
        expect(src).not.toMatch(/leader_earnings|AdSlot|adsbygoogle/)
        expect(readFileSync('src/domains/home/feed.ts', 'utf8')).not.toMatch(/from\('leader_earnings'\)/)
    })
})

describe('copy rules', () => {
    const texts = [JSON.stringify(HOME_COPY)]
    it('no middot or long dash', () => {
        for (const t of texts) expect(t).not.toMatch(/[·—–]/)
        for (const f of ['src/app/home/page.tsx', 'src/components/home/HomeMake.tsx', 'src/components/home/HomeTopBar.tsx']) {
            expect(readFileSync(f, 'utf8')).not.toMatch(/[·—–]/)
        }
    })
    it('no usage counts on /home and /pricing', () => {
        expect(JSON.stringify(HOME_COPY)).not.toMatch(/\d+\s*(번|회|장)/)
        const pricing = readFileSync('src/app/pricing/page.tsx', 'utf8')
        expect(pricing).not.toMatch(/한 달 답변|하루 3장|사진 \$\{/)
        expect(pricing).not.toContain('내 팀 봇과의 대화는 클로버를 쓰지 않아요')
    })
    it('root goes to the OS make screen (1003 「OS UI에 다 옮겨놔」)', () => {
        expect(readFileSync('src/app/page.tsx', 'utf8')).toContain("redirect('/os/make')")
        const cfg = readFileSync('next.config.ts', 'utf8')
        expect(cfg).toMatch(/source: '\/', destination: '\/os\/make', permanent: false/)
        expect(cfg).toMatch(/source: '\/home', destination: '\/os\/make', permanent: false/)
        expect(cfg).toMatch(/source: '\/mentors', destination: '\/os\/market', permanent: false/)
    })
})

describe('referral reward promise (D2 decided: show it)', () => {
    it('/invite shows the reward from the constant, no hardcoded number', () => {
        const src = readFileSync('src/app/invite/page.tsx', 'utf8')
        expect(src).toContain('친구가 가입하고 휴대폰 인증을 마치면 클로버 {REFERRER_REWARD}개를 드려요')
        expect(src).not.toMatch(/클로버 \d+개를 드려요/)
    })
    it('other screens still carry no stale reward numbers', () => {
        for (const f of ['src/app/pricing/page.tsx', 'src/components/ui/ShareInvite.tsx', 'src/app/missions/page.tsx', 'src/components/home/HomeTopBar.tsx']) {
            const src = readFileSync(f, 'utf8')
            expect(src, f).not.toMatch(/100클로버|클로버 100개를 받|friendClovers\}클로버|나에게 클로버/)
        }
        expect(readFileSync('src/components/home/HomeTopBar.tsx', 'utf8')).not.toContain('href="/invite"')
    })
})

describe('one pricing page (/os/charge)', () => {
    it('home links go to /os/charge and /pricing redirects there', () => {
        for (const f of ['src/app/home/page.tsx', 'src/components/home/HomeTopBar.tsx']) {
            const src = readFileSync(f, 'utf8')
            expect(src, f).toContain('href="/os/charge"')
            expect(src, f).not.toContain('href="/pricing"')
        }
        expect(readFileSync('next.config.ts', 'utf8')).toMatch(/source: '\/pricing', destination: '\/os\/charge', permanent: false/)
    })
})

import { HOME_COPY as HC } from '@/domains/home/copy'
describe('home 곳 고르기 순서와 SNS 안내', () => {
    it('블로그, 유튜브가 먼저이고 첫 칸이 블로그', () => {
        expect(HC.chips.map(c => c.id)).toEqual(['blog', 'youtube', 'instagram', 'threads', 'shop', 'file'])
    })
    it('SNS 안내는 3단계, 캡처와 붙여넣기를 말한다', () => {
        expect(HC.snsGuide).toHaveLength(3)
        expect(HC.snsGuide[0]).toBe('위 칸에 내 계정 주소를 넣어 주세요')
    })
    it('파일 안내에 쪽 수 숫자를 쓰지 않고 무료로도 올릴 수 있다고 말한다', () => {
        expect(HC.fileNote).toContain('무료')
        expect(HC.fileNote).not.toMatch(/\d/)
    })
})
