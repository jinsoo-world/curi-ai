// 계정 연결 = 인터넷 없이 확인할 수 있는 해석기 시험 (RSS, Atom, 사이트맵, robots.txt, 채널 번호)
import { describe, it, expect } from 'vitest'
import { parseFeed, parseSitemap, discoverFeedLinks, looksLikeFeed, newerThan, pickCandidates } from '../rss'
import { extractChannelId, resolveChannelInput, channelFeedUrl } from '../youtube'
import { parseRobots, robotsAllows, robotsBlocksAll } from '../website'
import { substackFeedUrl } from '../podcast'

const YOUTUBE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv"/>
 <id>yt:channel:abcdefghijklmnopqrstuv</id>
 <title>테스트 채널</title>
 <entry>
  <id>yt:video:AAAAAAAAAAA</id>
  <yt:videoId>AAAAAAAAAAA</yt:videoId>
  <title>두 번째 영상 &amp; 이야기</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=AAAAAAAAAAA"/>
  <published>2026-09-20T10:00:00+00:00</published>
  <updated>2026-09-21T10:00:00+00:00</updated>
  <media:group><media:description>설명 글</media:description></media:group>
 </entry>
 <entry>
  <id>yt:video:BBBBBBBBBBB</id>
  <title>첫 영상</title>
  <link rel="alternate" href="https://www.youtube.com/shorts/BBBBBBBBBBB"/>
  <published>2026-09-01T10:00:00+00:00</published>
 </entry>
</feed>`

const RSS2 = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>내 블로그</title><link>https://blog.example.com</link>
 <item>
  <title><![CDATA[새 글 <b>하나</b>]]></title>
  <link>https://blog.example.com/p/one</link>
  <description><![CDATA[<p>짧은 요약</p>]]></description>
  <content:encoded><![CDATA[<p>본문 전체 글입니다.</p>]]></content:encoded>
  <pubDate>Mon, 21 Sep 2026 09:00:00 GMT</pubDate>
 </item>
 <item>
  <title>링크 없는 팟캐스트 회차</title>
  <description>쇼노트</description>
  <enclosure url="https://cdn.example.com/ep2.mp3" type="audio/mpeg" length="1"/>
  <pubDate>Sun, 20 Sep 2026 09:00:00 GMT</pubDate>
 </item>
</channel></rss>`

describe('parseFeed = 유튜브 채널 피드(Atom)', () => {
    const items = parseFeed(YOUTUBE_ATOM)
    it('영상 2개의 제목, 주소, 날짜를 꺼낸다(채널 자기 링크는 빼고)', () => {
        expect(items).toHaveLength(2)
        expect(items[0].title).toBe('두 번째 영상 & 이야기')
        expect(items[0].url).toBe('https://www.youtube.com/watch?v=AAAAAAAAAAA')
        expect(items[0].publishedAt).toBe('2026-09-20T10:00:00.000Z')
        expect(items[0].description).toBe('설명 글')
        expect(items[1].url).toBe('https://www.youtube.com/shorts/BBBBBBBBBBB')
    })
    it('피드 모양을 알아본다', () => {
        expect(looksLikeFeed(YOUTUBE_ATOM)).toBe(true)
        expect(looksLikeFeed('<html><body>웹페이지</body></html>')).toBe(false)
    })
})

describe('parseFeed = RSS 2.0 (블로그, Substack, 팟캐스트)', () => {
    const items = parseFeed(RSS2)
    it('CDATA 를 벗기고 제목, 주소, 본문, 날짜를 꺼낸다', () => {
        expect(items).toHaveLength(2)
        expect(items[0].title).toBe('새 글 하나')
        expect(items[0].url).toBe('https://blog.example.com/p/one')
        expect(items[0].content).toContain('본문 전체 글입니다')
        expect(items[0].description).toContain('짧은 요약')
        expect(items[0].publishedAt).toBe('2026-09-21T09:00:00.000Z')
    })
    it('회차 주소가 없으면 소리 파일 주소를 이름표로 쓴다', () => {
        expect(items[1].url).toBe('https://cdn.example.com/ep2.mp3')
    })
    it('날짜 기준으로 새 글만 남긴다', () => {
        expect(newerThan(items, new Date('2026-09-20T12:00:00Z')).map(i => i.url)).toEqual(['https://blog.example.com/p/one'])
        expect(newerThan(items, null)).toHaveLength(2)
    })
})

describe('parseSitemap', () => {
    it('보통 사이트맵 = 글 주소 목록', () => {
        const sm = parseSitemap(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://a.com/post/1</loc><lastmod>2026-09-01</lastmod></url>
            <url><loc>https://a.com/post/2</loc></url>
            <url><loc>상대주소는빠짐</loc></url></urlset>`)
        expect(sm.kind).toBe('urlset')
        expect(sm.entries.map(e => e.loc)).toEqual(['https://a.com/post/1', 'https://a.com/post/2'])
        expect(sm.entries[0].lastmod).toBe('2026-09-01T00:00:00.000Z')
        expect(sm.entries[1].lastmod).toBeUndefined()
    })
    it('사이트맵 목차 = 다른 사이트맵 주소 목록', () => {
        const sm = parseSitemap(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <sitemap><loc>https://a.com/sitemap-posts.xml</loc><lastmod>2026-09-20</lastmod></sitemap>
            <sitemap><loc>https://a.com/sitemap-pages.xml</loc></sitemap></sitemapindex>`)
        expect(sm.kind).toBe('index')
        expect(sm.entries.map(e => e.loc)).toEqual(['https://a.com/sitemap-posts.xml', 'https://a.com/sitemap-pages.xml'])
    })
})

describe('discoverFeedLinks = 웹페이지 속 RSS 링크 찾기', () => {
    it('rss, atom 링크를 절대 주소로 돌려준다', () => {
        const html = `<head><link rel="stylesheet" href="/a.css">
            <link rel="alternate" type="application/rss+xml" title="피드" href="/feed">
            <link type="application/atom+xml" rel="alternate" href="https://b.com/atom.xml"></head>`
        expect(discoverFeedLinks(html, 'https://b.com/blog/')).toEqual(['https://b.com/feed', 'https://b.com/atom.xml'])
    })
})

describe('robots.txt', () => {
    it('모두(*)에게 전부 막으면 막힘으로 본다', () => {
        const r = parseRobots('User-agent: *\nDisallow: /\n')
        expect(robotsBlocksAll(r)).toBe(true)
    })
    it('일부만 막으면 그 경로만 막는다. 사이트맵 줄도 읽는다', () => {
        const r = parseRobots('# 주석\nUser-agent: *\nDisallow: /admin\nAllow: /admin/public\n\nSitemap: https://a.com/s.xml\n')
        expect(robotsBlocksAll(r)).toBe(false)
        expect(robotsAllows(r, '/post/1')).toBe(true)
        expect(robotsAllows(r, '/admin/x')).toBe(false)
        expect(robotsAllows(r, '/admin/public/y')).toBe(true)
        expect(r.sitemaps).toEqual(['https://a.com/s.xml'])
    })
    it('우리 이름 칸이 있으면 그 칸을 따른다', () => {
        const r = parseRobots('User-agent: *\nDisallow:\n\nUser-agent: CuriAI-Bot\nDisallow: /\n')
        expect(robotsBlocksAll(r)).toBe(true)
    })
    it('다른 로봇만 막으면 우리는 괜찮다', () => {
        const r = parseRobots('User-agent: GPTBot\nDisallow: /\n')
        expect(robotsBlocksAll(r)).toBe(false)
    })
})

describe('유튜브 채널 번호 찾기', () => {
    it('입력 모양별로 채널 번호나 열어 볼 주소를 정한다', () => {
        expect(resolveChannelInput('@somechannel')).toEqual({ pageUrl: 'https://www.youtube.com/@somechannel' })
        expect(resolveChannelInput('somechannel')).toEqual({ pageUrl: 'https://www.youtube.com/@somechannel' })
        expect(resolveChannelInput('https://www.youtube.com/@somechannel/videos')).toEqual({ pageUrl: 'https://www.youtube.com/@somechannel' })
        expect(resolveChannelInput('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv')).toEqual({ channelId: 'UCabcdefghijklmnopqrstuv' })
        expect(resolveChannelInput('UCabcdefghijklmnopqrstuv')).toEqual({ channelId: 'UCabcdefghijklmnopqrstuv' })
        expect(resolveChannelInput('https://evil.com/@x')).toBeNull()
        expect(resolveChannelInput('')).toBeNull()
    })
    it('채널 페이지에서 번호를 꺼낸다(확실한 자리 먼저)', () => {
        const html = `<script>{"channelId":"UCzzzzzzzzzzzzzzzzzzzzzz"}</script>
            <meta itemprop="channelId" content="UCabcdefghijklmnopqrstuv">`
        expect(extractChannelId(html)).toBe('UCabcdefghijklmnopqrstuv')
        expect(extractChannelId('{"externalId":"UCyyyyyyyyyyyyyyyyyyyyyy"}')).toBe('UCyyyyyyyyyyyyyyyyyyyyyy')
        expect(extractChannelId('<html>없음</html>')).toBeNull()
        expect(channelFeedUrl('UCabcdefghijklmnopqrstuv')).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv')
    })
})

describe('Substack 주소', () => {
    it('사이트 주소에 /feed 를 붙인다', () => {
        expect(substackFeedUrl('https://name.substack.com')).toBe('https://name.substack.com/feed')
        expect(substackFeedUrl('https://name.substack.com/p/some-post')).toBe('https://name.substack.com/feed')
        expect(substackFeedUrl('name.substack.com/feed')).toBe('https://name.substack.com/feed')
        expect(substackFeedUrl('@name')).toBe('https://name.substack.com/feed')
    })
})

describe('pickCandidates = 이미 있는 주소는 읽지도 않는다', () => {
    it('있는 주소를 빼고 한도만큼만 고른다', () => {
        const items = [{ url: 'https://a.com/1' }, { url: 'https://a.com/2' }, { url: 'https://a.com/3' }, { url: 'https://a.com/2' }]
        const known = new Set(['https://a.com/1'])
        expect(pickCandidates(items, { isKnown: u => known.has(u), maxItems: 5 }).map(i => i.url)).toEqual(['https://a.com/2', 'https://a.com/3'])
        expect(pickCandidates(items, { maxItems: 1 })).toHaveLength(1)
        expect(pickCandidates(items, {}, 2)).toHaveLength(2)
    })
})

describe('공식 YouTube Data API 응답 해석 (공개 피드가 안 될 때)', () => {
    it('영상 번호, 제목, 올린 날을 꺼내고 이상한 번호는 뺀다', async () => {
        const { parsePlaylistItems } = await import('../youtube')
        const json = JSON.stringify({ items: [
            { snippet: { title: '새 영상' }, contentDetails: { videoId: 'AAAAAAAAAAA', videoPublishedAt: '2026-09-20T10:00:00Z' } },
            { snippet: { title: '이상한 것' }, contentDetails: { videoId: '../../x' } },
        ] })
        expect(parsePlaylistItems(json)).toEqual([{ title: '새 영상', url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA', publishedAt: '2026-09-20T10:00:00Z' }])
        expect(parsePlaylistItems('깨진 글')).toEqual([])
    })
})
