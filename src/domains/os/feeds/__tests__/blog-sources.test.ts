// 블로그 글 목록 찾기 흐름 (인터넷 대신 가짜 응답): 워드프레스 REST → 표준 RSS 찾기 → 사이트맵, 미디엄 글 하나
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { KnowledgeFeed } from '../types'

const pages: Record<string, string> = {}
const fetchPageSafely = vi.fn(async (url: string, _o?: unknown) => {
    // 키 끝이 * 이면 앞부분이 같은 모든 주소 (쿼리가 붙는 REST 주소용)
    const key = Object.keys(pages).find(k => k === url || (k.endsWith('*') && url.startsWith(k.slice(0, -1))))
    const body = key === undefined ? undefined : pages[key]
    return body === undefined
        ? { ok: false as const, requestedUrl: url, reason: '그 주소가 열리지 않아요(응답 404)' }
        : { ok: true as const, url, requestedUrl: url, contentType: 'text/html', body }
})
vi.mock('@/domains/agent/fetch-url', async (orig) => ({
    ...(await orig<typeof import('@/domains/agent/fetch-url')>()),
    fetchPageSafely: (url: string, o?: unknown) => fetchPageSafely(url, o),
}))
const readUrl = vi.fn(async (url: string, _o?: unknown) => ({ ok: true as const, url, requestedUrl: url, title: `제목 ${url}`, text: `본문 ${url} `.repeat(5), kind: 'web' as const }))
vi.mock('@/domains/os/readers', async (orig) => ({
    ...(await orig<typeof import('@/domains/os/readers')>()),
    readUrl: (url: string, o?: unknown) => readUrl(url, o),
}))

const { fetchWebsiteItems } = await import('../website')
const { readMediumFromFeed } = await import('../../readers/medium')
const { detectBlogKind } = await import('../blog')

const feed = (h: string): KnowledgeFeed => ({
    id: 'f1', mentorId: 'm1', userId: 'u1', kind: 'website', handleOrUrl: h, status: 'connected',
    lastSyncedAt: null, lastError: null, itemCount: 0, createdAt: '2026-09-01T00:00:00Z',
})
const long = (n: string) => `<p>${(n + ' 안녕하세요 오늘 글입니다. ').repeat(100)}</p>`

beforeEach(() => {
    for (const k of Object.keys(pages)) delete pages[k]
    fetchPageSafely.mockClear(); readUrl.mockClear()
})

describe('워드프레스 REST 가 먼저', () => {
    it('REST 로 글 전체를 한 번에 받고 글 주소는 열지 않는다. 한 번에 30편까지 요청', async () => {
        pages['https://wp.test/'] = `<html><head><link rel='https://api.w.org/' href='https://wp.test/wp-json/' /></head></html>`
        const posts = Array.from({ length: 30 }, (_, i) => ({ link: `https://wp.test/p/${i}`, title: { rendered: `글 ${i}` }, date_gmt: `2026-09-${String(i % 28 + 1).padStart(2, '0')}T00:00:00`, content: { rendered: long(`n${i}`) } }))
        pages['https://wp.test/wp-json/wp/v2/posts*'] = JSON.stringify(posts)
        const r = await fetchWebsiteItems(feed('https://wp.test/'), null, { maxItems: 30 })
        expect(r.items.length).toBe(30)
        expect(readUrl).not.toHaveBeenCalled()
        const restCall = fetchPageSafely.mock.calls.map(c => c[0]).find(u => u.includes('/wp-json/wp/v2/posts'))!
        const q = new URL(restCall).searchParams
        expect(q.get('per_page')).toBe('30')
        expect(q.get('_fields')).toContain('content')
        expect(r.items[0].text).toContain('안녕하세요')
        expect(r.items.every(i => i.url.startsWith('https://wp.test/'))).toBe(true)
    })

    it('이미 있는 글은 건너뛰고, 남은 자리(maxItems)만큼만', async () => {
        pages['https://wp.test/'] = `<html><link rel="https://api.w.org/" href="https://wp.test/wp-json/"></html>`
        const posts = Array.from({ length: 10 }, (_, i) => ({ link: `https://wp.test/p/${i}`, title: { rendered: `글 ${i}` }, content: { rendered: long(`n${i}`) } }))
        pages['https://wp.test/wp-json/wp/v2/posts*'] = JSON.stringify(posts)
        const r = await fetchWebsiteItems(feed('https://wp.test/'), null, { maxItems: 3, isKnown: u => u.endsWith('/p/0') })
        expect(r.items.map(i => i.url)).toEqual(['https://wp.test/p/1', 'https://wp.test/p/2', 'https://wp.test/p/3'])
    })

    it('REST 가 막혀 있으면 표준 RSS 로 넘어간다 (댓글 피드는 건너뜀)', async () => {
        pages['https://wp.test/'] = `<html><link rel="https://api.w.org/" href="https://wp.test/wp-json/"><link rel="alternate" type="application/rss+xml" href="/comments/feed/"><link rel="alternate" type="application/rss+xml" href="/feed/"></html>`
        pages['https://wp.test/feed/'] = `<rss><channel><item><title>피드 글</title><link>https://wp.test/a</link><pubDate>Mon, 21 Sep 2026 09:00:00 GMT</pubDate><content:encoded><![CDATA[${long('feed')}]]></content:encoded></item></channel></rss>`
        const r = await fetchWebsiteItems(feed('https://wp.test/'), null)
        expect(r.items.map(i => i.url)).toEqual(['https://wp.test/a'])
        expect(fetchPageSafely.mock.calls.map(c => c[0])).not.toContain('https://wp.test/comments/feed/')
    })
})

describe('표준 RSS 자동 찾기', () => {
    it('피드에 본문이 충분하면 글 주소를 또 열지 않는다', async () => {
        pages['https://blog.test/'] = `<html><link rel="alternate" type="application/atom+xml" href="https://blog.test/atom.xml"></html>`
        pages['https://blog.test/atom.xml'] = `<feed><entry><title>첫 글</title><link rel="alternate" href="https://blog.test/1"/><published>2026-09-20T00:00:00Z</published><content type="html"><![CDATA[${long('a')}]]></content></entry></feed>`
        const r = await fetchWebsiteItems(feed('https://blog.test/'), null)
        expect(r.items.length).toBe(1)
        expect(readUrl).not.toHaveBeenCalled()
    })

    it('브런치처럼 피드에 요약뿐이면 글 주소를 열어 전체를 읽는다 (실패하면 요약이라도)', async () => {
        pages['https://brunch.test/@a'] = `<html><link rel="alternate" type="application/rss+xml" href="https://brunch.test/rss/@@abc"></html>`
        pages['https://brunch.test/rss/@@abc'] = `<rss><channel>
            <item><title>글 하나</title><link>https://brunch.test/@@abc/2</link><description>${'요약입니다 '.repeat(10)}</description></item>
            <item><title>글 둘</title><link>https://brunch.test/@@abc/1</link><description>${'요약입니다 '.repeat(10)}</description></item></channel></rss>`
        readUrl.mockImplementationOnce(async (url: string) => ({ ok: true as const, url, requestedUrl: url, title: 't', text: `전체 본문 ${url} `.repeat(20), kind: 'web' as const }))
        readUrl.mockImplementationOnce(async (url: string) => ({ ok: false as const, requestedUrl: url, reason: '막혔어요' } as never))
        const r = await fetchWebsiteItems(feed('https://brunch.test/@a'), null)
        expect(readUrl).toHaveBeenCalledTimes(2)
        expect(r.items.length).toBe(2)
        expect(r.items.find(i => i.url.endsWith('/2'))!.text).toContain('전체 본문')
        expect(r.items.find(i => i.url.endsWith('/1'))!.text).toContain('요약입니다')
    })

    it('목록을 아무 데서도 못 찾으면 짧은 이유(붙여넣기 안내)를 던진다', async () => {
        pages['https://none.test/'] = '<html><body>글이 없는 첫 화면</body></html>'
        await expect(fetchWebsiteItems(feed('https://none.test/'), null)).rejects.toThrow('붙여넣어')
    })
})

describe('미디엄 글 하나', () => {
    it('화면이 막히면 계정 RSS 안에서 같은 글을 찾는다', async () => {
        pages['https://medium.com/feed/@a'] = `<rss><channel><item><title><![CDATA[내 글]]></title><link>https://medium.com/@a/my-post-62edea66ffa4?source=rss-1</link><content:encoded><![CDATA[${long('m')}]]></content:encoded></item></channel></rss>`
        const r = await readMediumFromFeed('https://medium.com/@a/my-post-62edea66ffa4', { timeoutMs: 5_000, maxChars: 100_000 })
        expect(r && r.ok && r.title).toBe('내 글')
        expect(r && r.ok && r.text).toContain('안녕하세요')
        // RSS 에 없는 옛 글은 못 찾는다
        expect(await readMediumFromFeed('https://medium.com/@a/old-post-aaaaaaaaaaaa', { timeoutMs: 5_000, maxChars: 100_000 })).toBeNull()
    })
})

describe('글 하나인지 목록인지 (화면을 열어 본다)', () => {
    it('주소로 모르면 화면의 og:type 을 본다. 못 열면 목록', async () => {
        pages['https://x.test/about-me'] = '<meta property="og:type" content="article">'
        pages['https://x.test/team'] = '<meta property="og:type" content="website">'
        expect(await detectBlogKind('https://x.test/about-me')).toBe('post')
        expect(await detectBlogKind('https://x.test/team')).toBe('account')
        expect(await detectBlogKind('https://x.test/none')).toBe('account')
        expect(await detectBlogKind('https://x.test/')).toBe('account')       // 첫 화면은 열지도 않는다
        expect(fetchPageSafely.mock.calls.map(c => c[0])).not.toContain('https://x.test/')
    })
})
