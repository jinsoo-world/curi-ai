// 웹사이트 가져오기 = 인터넷 대신 가짜 응답(fetchPageSafely)을 넣어 흐름을 본다
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { KnowledgeFeed } from '../types'

const pages: Record<string, string> = {}
const fetchPageSafely = vi.fn(async (url: string) => {
    const body = pages[url]
    return body === undefined
        ? { ok: false as const, requestedUrl: url, reason: '그 주소가 열리지 않아요(응답 404)' }
        : { ok: true as const, url, requestedUrl: url, contentType: 'text/xml', body }
})
vi.mock('@/domains/agent/fetch-url', async (orig) => ({
    ...(await orig<typeof import('@/domains/agent/fetch-url')>()),
    fetchPageSafely: (url: string) => fetchPageSafely(url),
}))
const readUrl = vi.fn(async (url: string) => ({ ok: true as const, url, requestedUrl: url, title: `제목 ${url}`, text: `본문 ${url}`, kind: 'web' as const }))
vi.mock('@/domains/os/readers', async (orig) => ({
    ...(await orig<typeof import('@/domains/os/readers')>()),
    readUrl: (url: string) => readUrl(url),
}))

const { fetchWebsiteItems } = await import('../website')

const feed: KnowledgeFeed = {
    id: 'f1', mentorId: 'm1', userId: 'u1', kind: 'website', handleOrUrl: 'a.com', status: 'connected',
    lastSyncedAt: null, lastError: null, itemCount: 0, createdAt: '2026-09-01T00:00:00Z',
}

beforeEach(() => {
    for (const k of Object.keys(pages)) delete pages[k]
    fetchPageSafely.mockClear(); readUrl.mockClear()
})

describe('fetchWebsiteItems', () => {
    it('사이트맵 목차를 한 단계 따라가 새 글만 읽는다(이미 있는 주소는 안 연다)', async () => {
        pages['https://a.com/robots.txt'] = 'User-agent: *\nDisallow: /admin\n'
        pages['https://a.com/sitemap.xml'] = `<sitemapindex><sitemap><loc>https://a.com/s-posts.xml</loc></sitemap></sitemapindex>`
        pages['https://a.com/s-posts.xml'] = `<urlset>
            <url><loc>https://a.com/post/1</loc><lastmod>2026-09-10</lastmod></url>
            <url><loc>https://a.com/post/2</loc><lastmod>2026-09-12</lastmod></url>
            <url><loc>https://a.com/admin/secret</loc><lastmod>2026-09-13</lastmod></url>
            <url><loc>https://other.com/x</loc></url></urlset>`
        const r = await fetchWebsiteItems(feed, null, { isKnown: u => u === 'https://a.com/post/1' })
        expect(r.items.map(i => i.url)).toEqual(['https://a.com/post/2'])
        expect(readUrl).toHaveBeenCalledTimes(1)
        expect(readUrl.mock.calls[0][0]).toBe('https://a.com/post/2')
        // 모든 요청이 안전한 가져오기를 지났다
        expect(fetchPageSafely.mock.calls.map(c => c[0])).toEqual(['https://a.com/robots.txt', 'https://a.com/sitemap.xml', 'https://a.com/s-posts.xml'])
    })

    it('robots.txt 가 전부 막으면 글을 하나도 열지 않고 이유를 던진다', async () => {
        pages['https://a.com/robots.txt'] = 'User-agent: *\nDisallow: /\n'
        await expect(fetchWebsiteItems(feed, null)).rejects.toThrow('robots.txt')
        expect(readUrl).not.toHaveBeenCalled()
    })

    it('사이트맵이 없으면 첫 화면의 RSS 링크로 읽는다', async () => {
        pages['https://a.com/'] = '<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>'
        pages['https://a.com/feed.xml'] = `<rss><channel><item><title>새 글</title><link>https://a.com/p/new</link><pubDate>Mon, 21 Sep 2026 09:00:00 GMT</pubDate></item></channel></rss>`
        const r = await fetchWebsiteItems(feed, null)
        expect(r.items.map(i => i.url)).toEqual(['https://a.com/p/new'])
        expect(r.items[0].title).toBe('새 글')
    })

    it('사이트맵도 RSS 도 없으면 사람 말로 던진다', async () => {
        pages['https://a.com/'] = '<html><body>그냥 첫 화면</body></html>'
        await expect(fetchWebsiteItems(feed, null)).rejects.toThrow('글 목록')
    })
})
