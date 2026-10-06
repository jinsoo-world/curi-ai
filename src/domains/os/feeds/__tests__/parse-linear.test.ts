// 보안 검토(PR #53): 닫는 태그 없는 큰 피드에서 해석기가 제곱 시간으로 멈추던 것 = 앞으로만 훑는 방식 + 최대 200개
import { describe, it, expect } from 'vitest'
import { parseFeed, parseSitemap, discoverFeedLinks, decodeXml, MAX_FEED_ENTRIES } from '../parse'

const within = (ms: number, fn: () => unknown) => {
    const t = Date.now()
    fn()
    return Date.now() - t < ms
}

describe('피드 해석기는 큰 문서에서도 선형', () => {
    it('닫는 태그 없는 <item>, <entry> 가 5MB 여도 1초 안', () => {
        const items = '<rss><channel>' + '<item><title>x'.repeat(5 * 1024 * 1024 / 14)
        expect(within(1_000, () => expect(parseFeed(items)).toEqual([]))).toBe(true)
        const entries = '<feed>' + '<entry><link href="https://a.com/1"><title>x'.repeat(5 * 1024 * 1024 / 40)
        expect(within(1_000, () => parseFeed(entries))).toBe(true)
    })

    it('닫힌 블록 안에 닫히지 않은 태그, 끝나지 않은 여는 태그가 잔뜩 있어도 1초 안', () => {
        const inner = '<title>'.repeat(200_000) + '<link '.repeat(200_000) + '<![CDATA['.repeat(100_000)
        const doc = `<rss><channel><item>${inner}<link>https://a.com/1</link></item></channel></rss>`
        expect(within(1_000, () => parseFeed(doc))).toBe(true)
        expect(within(1_000, () => discoverFeedLinks('<link '.repeat(500_000), 'https://a.com/'))).toBe(true)
        expect(within(1_000, () => decodeXml('<![CDATA['.repeat(300_000)))).toBe(true)
        expect(within(1_000, () => parseSitemap('<urlset>' + '<url><loc>https://a.com/'.repeat(200_000)))).toBe(true)
    })

    it('글은 최대 MAX_FEED_ENTRIES(200)개까지만', () => {
        const xml = '<rss><channel>' + Array.from({ length: 500 }, (_, i) => `<item><title>글 ${i}</title><link>https://a.com/${i}</link></item>`).join('') + '</channel></rss>'
        const out = parseFeed(xml)
        expect(MAX_FEED_ENTRIES).toBe(200)
        expect(out).toHaveLength(200)
        expect(out[0]).toMatchObject({ title: '글 0', url: 'https://a.com/0' })
    })

    it('보통 피드는 예전과 똑같이 읽는다 (대소문자, 속성, CDATA)', () => {
        const xml = `<rss><channel><ITEM a="1"><Title><![CDATA[제목 &amp; 하나]]></Title><link>https://a.com/1</link><description>설명</description><content:encoded><![CDATA[<p>본문</p>]]></content:encoded><pubDate>Tue, 06 Oct 2026 01:00:00 GMT</pubDate></ITEM></channel></rss>`
        expect(parseFeed(xml)).toEqual([{ title: '제목 & 하나', url: 'https://a.com/1', description: '설명', content: '<p>본문</p>', publishedAt: '2026-10-06T01:00:00.000Z', hasMedia: false }])
        const atom = `<feed><entry><title>영상</title><link rel="self" href="https://x/self"/><link rel="alternate" href="https://a.com/v"/><media:description>설명</media:description></entry></feed>`
        expect(parseFeed(atom)[0]).toMatchObject({ title: '영상', url: 'https://a.com/v', description: '설명' })
    })
})
