// 블로그 확장 (대표 승인 1005 11:27): 미디엄, 브런치, 워드프레스, 일반 사이트, X, 링크드인 주소 판별과 순수 규칙
import { describe, it, expect } from 'vitest'
import { classifySnsLink, snsCanonicalKey } from '../sns-link'
import { accountKeyOf, linkLabelOf, MIN_TEXT_CHARS } from '../link-rules'
import { isMediumPostUrl, mediumFeedUrl, mediumPostId } from '../readers/medium'
import { wpApiBaseFrom, parseWpPosts, postPathHint, pageIsArticle, pickPostFeedLinks, WP_MAX_POSTS } from '../feeds/blog'
import { NO_LIST_LINE } from '../feeds/website'
import { SNS_NO_READ_LINE } from '../onboarding'
import { draftLinkKind, postUrlOf } from '../twin-draft-shared'
import { homeLinkGuide } from '@/domains/home/link-guide'
import { isPrivateIp, isSafeFetchUrl, isBlockedHost } from '@/domains/agent/fetch-url'

describe('주소 판별', () => {
    it('미디엄: 계정과 매체는 공식 RSS, 글 하나는 그 글만', () => {
        const a = classifySnsLink('https://medium.com/@someone')
        expect(a.platform).toBe('medium')
        expect(a.feed).toEqual({ kind: 'podcast', handleOrUrl: 'https://medium.com/feed/@someone' })
        expect(a.paste).toBe(true)
        expect(classifySnsLink('https://medium.com/feed/@someone').feed?.handleOrUrl).toBe('https://medium.com/feed/@someone')
        expect(classifySnsLink('https://medium.com/better-programming').feed?.handleOrUrl).toBe('https://medium.com/feed/better-programming')
        expect(classifySnsLink('https://me.medium.com').feed?.handleOrUrl).toBe('https://me.medium.com/feed')
        const p = classifySnsLink('https://medium.com/@someone/my-first-post-62edea66ffa4')
        expect(p.single).toBe(true)
        expect(p.feed).toBeNull()
        expect(classifySnsLink('https://me.medium.com/my-post-62edea66ffa4?source=x').single).toBe(true)
        expect(() => classifySnsLink('https://medium.com/')).toThrow('미디엄')
    })
    it('브런치: 작가 주소는 읽기(숨은 RSS 찾기), 글 하나는 그 글만, RSS 주소는 그대로', () => {
        expect(classifySnsLink('https://brunch.co.kr/@me').feed).toEqual({ kind: 'website', handleOrUrl: 'https://brunch.co.kr/@me' })
        const post = classifySnsLink('https://brunch.co.kr/@me/12')
        expect(post.single).toBe(true)
        expect(post.feed).toBeNull()
        expect(post.paste).toBe(true)
        expect(classifySnsLink('https://brunch.co.kr/rss/@@2xr').feed).toEqual({ kind: 'podcast', handleOrUrl: 'https://brunch.co.kr/rss/@@2xr' })
        expect(classifySnsLink('https://brunch.co.kr/magazine/abc').single).toBeFalsy()
    })
    it('워드프레스닷컴과 일반 사이트, RSS 는 읽고 못 읽으면 붙여넣기', () => {
        const wp = classifySnsLink('https://myblog.wordpress.com')
        expect(wp.platform).toBe('wordpress')
        expect(wp.feed?.kind).toBe('website')
        expect(wp.paste).toBe(true)
        expect(classifySnsLink('https://example.com').paste).toBe(true)
        expect(classifySnsLink('https://example.com/feed').paste).toBe(true)
        expect(classifySnsLink('https://example.com/feed').feed?.kind).toBe('podcast')
        expect(classifySnsLink('https://myblog.tistory.com').paste).toBe(true)
    })
    it('X 와 링크드인은 읽지 않고 붙여넣기 안내만', () => {
        for (const u of ['https://x.com/me', 'https://twitter.com/me/status/1', 'https://www.linkedin.com/in/me', 'https://www.linkedin.com/posts/me_abc-123', 'https://lnkd.in/abc']) {
            const t = classifySnsLink(u)
            expect(t.feed).toBeNull()
            expect(t.single).toBeFalsy()
            expect(t.paste).toBe(true)
        }
        expect(classifySnsLink('https://www.linkedin.com/in/me').platform).toBe('linkedin')
        expect(draftLinkKind('https://www.linkedin.com/in/me')).toBe('paste')
        expect(draftLinkKind('https://x.com/me')).toBe('paste')
        expect(homeLinkGuide('https://www.linkedin.com/in/me').needPaste).toBe(true)
        expect(homeLinkGuide('https://x.com/me').needPaste).toBe(true)
    })
    it('같은 계정은 같은 열쇠 (보너스 한 주소 한 계정, 칸 하나)', () => {
        const k = (u: string) => snsCanonicalKey(classifySnsLink(u))
        expect(k('https://medium.com/@someone')).toBe('medium:@someone')
        expect(k('https://medium.com/@someone/a-post-62edea66ffa4')).toBe('medium:@someone')
        expect(k('https://me.medium.com/a-post-62edea66ffa4')).toBe('medium:me')
        expect(k('https://myblog.wordpress.com')).toBe(k('https://myblog.wordpress.com/2026/10/05/hello'))
        expect(accountKeyOf('https://medium.com/feed/@someone')).toBe('medium:@someone')
        expect(accountKeyOf('https://medium.com/@someone/x-62edea66ffa4?source=rss-1')).toBe('medium:@someone')
        expect(accountKeyOf('https://medium.com/blog/x-62edea66ffa4')).toBe('medium:blog')
        expect(accountKeyOf('https://medium.com/m/signin')).toBeNull()
        expect(accountKeyOf('https://brunch.co.kr/rss/@@2xr')).toBe('brunch:@@2xr')
        expect(accountKeyOf('https://brunch.co.kr/@@2xr/432')).toBe('brunch:@@2xr')
        expect(accountKeyOf('https://example.com/2026/10/post')).toBeNull()
        expect(linkLabelOf('https://medium.com/@a')).toBe('미디엄')
        expect(linkLabelOf('https://www.linkedin.com/in/a')).toBe('링크드인')
    })
    it('블로그 글 하나 주소 알아보기', () => {
        expect(postUrlOf('https://brunch.co.kr/@me/12')).toBe('https://brunch.co.kr/@me/12')
        expect(postUrlOf('https://brunch.co.kr/@me')).toBeNull()
        expect(postUrlOf('https://medium.com/@me/hello-62edea66ffa4')).toBe('https://medium.com/@me/hello-62edea66ffa4')
        expect(postUrlOf('https://medium.com/@me')).toBeNull()
    })
})

describe('미디엄 도우미', () => {
    it('글 주소와 번호, RSS 주소', () => {
        expect(isMediumPostUrl('https://medium.com/@a/hello-world-62edea66ffa4')).toBe(true)
        expect(isMediumPostUrl('https://medium.com/@a')).toBe(false)
        expect(isMediumPostUrl('https://medium.com/p/62edea66ffa4')).toBe(true)
        expect(isMediumPostUrl('https://example.com/a/hello-62edea66ffa4')).toBe(false)
        expect(mediumPostId('https://medium.com/@a/hello-world-62EDEA66FFA4?source=rss')).toBe('62edea66ffa4')
        expect(mediumFeedUrl('https://medium.com/@a/hello-62edea66ffa4')).toBe('https://medium.com/feed/@a')
        expect(mediumFeedUrl('https://medium.com/')).toBeNull()
        expect(mediumFeedUrl('https://evil.com/@a')).toBeNull()
    })
})

describe('워드프레스 REST', () => {
    it('머리말의 api.w.org 링크에서 REST 주소를 찾는다 (같은 사이트만)', () => {
        const html = `<link rel='https://api.w.org/' href='https://example.com/news/wp-json/' />`
        expect(wpApiBaseFrom(html, 'https://example.com/news/')).toBe('https://example.com/news/wp-json/')
        // 다른 서버를 가리키면 쓰지 않는다 (사이트 주인이 정한 곳이 아니다)
        expect(wpApiBaseFrom(`<link rel="https://api.w.org/" href="https://evil.test/wp-json/">`, 'https://example.com/')).toBeNull()
        expect(wpApiBaseFrom(`<link rel="https://api.w.org/" href="http://169.254.169.254/wp-json/">`, 'https://example.com/')).toBeNull()
        // 표시가 없어도 wp-content 흔적이 있으면 기본 주소를 시험한다
        expect(wpApiBaseFrom('<img src="/wp-content/uploads/a.png">', 'https://example.com/blog')).toBe('https://example.com/wp-json/')
        expect(wpApiBaseFrom('<html><body>hi</body></html>', 'https://example.com/')).toBeNull()
    })
    it('글 목록 JSON: 제목 글자 되살리기, 날짜, 비밀번호 글과 너무 짧은 글은 뺀다', () => {
        const long = '<p>' + '안녕하세요 오늘의 글입니다. '.repeat(10) + '</p>'
        const items = parseWpPosts([
            { link: 'https://a.com/p1', title: { rendered: 'Tom &#038; Jerry&#8217;s' }, date_gmt: '2026-09-22T10:00:00', content: { rendered: long } },
            { link: 'https://a.com/p2', title: { rendered: '비밀' }, content: { rendered: long, protected: true } },
            { link: 'https://a.com/p3', title: { rendered: '짧음' }, content: { rendered: '<p>짧다</p>' } },
            { link: 'javascript:alert(1)', title: { rendered: 'x' }, content: { rendered: long } },
            { link: 'https://a.com/p5', title: { rendered: '요약만' }, content: { rendered: '' }, excerpt: { rendered: long } },
            null,
        ])
        expect(items.map(i => i.url)).toEqual(['https://a.com/p1', 'https://a.com/p5'])
        expect(items[0].title).toBe('Tom & Jerry’s')
        expect(items[0].publishedAt).toBe('2026-09-22T10:00:00.000Z')
        expect(items[0].text).toContain('안녕하세요')
        expect(items[0].text).not.toContain('<p>')
        expect(parseWpPosts({ code: 'rest_forbidden' })).toEqual([])
        expect(WP_MAX_POSTS).toBe(30)
    })
})

describe('글 하나인지 목록인지', () => {
    it('주소 모양', () => {
        expect(postPathHint('https://a.com/')).toBe('list')
        expect(postPathHint('https://a.com')).toBe('list')
        expect(postPathHint('https://a.com/?p=123')).toBe('post')
        expect(postPathHint('https://a.com/2026/10/05/hello-world/')).toBe('post')
        expect(postPathHint('https://a.com/blog/2026/10/05/hello')).toBe('post')
        expect(postPathHint('https://a.com/2026/10/05/')).toBe('list')          // 날짜 목록
        expect(postPathHint('https://a.com/2026/10/')).toBe('list')
        expect(postPathHint('https://a.com/category/diary')).toBe('list')
        expect(postPathHint('https://a.com/blog')).toBe('list')
        expect(postPathHint('https://a.com/blog/my-post')).toBe('post')
        expect(postPathHint('https://a.com/entry/123.html')).toBe('post')
        expect(postPathHint('https://a.com/feed.xml')).toBe('list')
        expect(postPathHint('https://a.com/about')).toBeNull()
    })
    it('화면 내용: og:type article 이거나 글 종류 JSON-LD', () => {
        expect(pageIsArticle('<meta property="og:type" content="article">')).toBe(true)
        expect(pageIsArticle('<meta content="article" property="og:type" />')).toBe(true)
        expect(pageIsArticle('<meta property="og:type" content="website">')).toBe(false)
        expect(pageIsArticle('<meta property="og:type" content="profile">')).toBe(false)
        expect(pageIsArticle('<script type="application/ld+json">{"@type":"BlogPosting"}</script>')).toBe(true)
        expect(pageIsArticle('<html></html>')).toBe(false)
    })
    it('댓글 피드는 글 피드가 아니다', () => {
        expect(pickPostFeedLinks(['https://a.com/comments/feed/', 'https://a.com/feed/', 'https://a.com/post/comments'])).toEqual(['https://a.com/feed/'])
    })
})

describe('고객 문구 규칙 (가운뎃점, 긴 대시, 한도 숫자 없음)', () => {
    it('새 문구', () => {
        for (const line of [NO_LIST_LINE, SNS_NO_READ_LINE, '미디엄에서 글 읽기를 막고 있어요. 다시 시도하거나 글을 붙여넣어 주세요']) {
            expect(line).not.toMatch(/[·—–]/)
            expect(line).not.toMatch(/\d/)
            expect(line.length).toBeLessThan(60)
        }
        expect(MIN_TEXT_CHARS).toBe(30)
    })
})

describe('밖으로 나가는 주소 막기 (SSRF)', () => {
    it('사설, 예약 대역과 IPv6 에 품은 IPv4 를 막는다', () => {
        for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '198.18.0.1', '192.0.0.1', '192.0.2.5',
            '::1', '::', 'fd00:ec2::254', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', '2002:7f00:1::1']) {
            expect(isPrivateIp(ip), ip).toBe(true)
        }
        for (const ip of ['8.8.8.8', '192.0.78.13', '151.101.1.1', '2606:4700::1111', '::ffff:808:808']) {
            expect(isPrivateIp(ip), ip).toBe(false)
        }
    })
    it('주소 모양 검사', () => {
        for (const u of ['http://localhost/', 'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://[::1]/', 'http://[::ffff:7f00:1]/', 'http://169.254.169.254/latest/meta-data/',
            'http://metadata.google.internal/', 'http://a.internal/', 'http://x.local/', 'file:///etc/passwd', 'ftp://example.com/', 'http://user:pw@example.com/', 'https://abc.vercel.app/']) {
            expect(isSafeFetchUrl(u), u).toBe(false)
        }
        expect(isSafeFetchUrl('https://brunch.co.kr/@brunch')).toBe(true)
        expect(isBlockedHost('foo.supabase.co')).toBe(true)
        // 새 읽기 길이 만드는 주소도 같은 검사를 지난다
        expect(isSafeFetchUrl('https://medium.com/feed/@a')).toBe(true)
        expect(isSafeFetchUrl('https://a.medium.com/feed')).toBe(true)
    })
})
