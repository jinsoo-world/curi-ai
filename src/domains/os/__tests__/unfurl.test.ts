import { describe, it, expect } from 'vitest'
import {
    metaFromHtml, skeletonCard, absolutizeUrl, domainOf, pickFaviconHref,
} from '../unfurl'

const html = `
<html><head>
<title>중장년 경험 수익화 플랫폼, 큐리어스</title>
<meta property="og:title" content="중장년 경험 수익화 플랫폼, 큐리어스" />
<meta property="og:image" content="/og.png" />
<meta property="og:description" content="설명입니다" />
<link rel="icon" href="/favicon.png" />
</head><body></body></html>`

describe('unfurl — OG 메타 파싱', () => {
    it('제목·도메인·절대 이미지·파비콘을 뽑는다', () => {
        const c = metaFromHtml(html, 'https://curious-500.com/v2/home', 'https://curious-500.com/v2/home')
        expect(c.ok).toBe(true)
        expect(c.title).toContain('큐리어스')
        expect(c.domain).toBe('curious-500.com')
        expect(c.imageUrl).toBe('https://curious-500.com/og.png')
        expect(c.faviconUrl).toBe('https://curious-500.com/favicon.png')
        expect(c.title).not.toMatch(/[·—]/)
    })

    it('못 읽어도 도메인 골격을 유지한다', () => {
        const s = skeletonCard('https://example.com/a')
        expect(s.ok).toBe(false)
        expect(s.domain).toBe('example.com')
        expect(s.title).toBe('example.com')
        expect(s.faviconUrl).toContain('example.com')
    })

    it('absolutizeUrl / domainOf 기본', () => {
        expect(domainOf('https://www.foo.com/x')).toBe('foo.com')
        expect(absolutizeUrl('/a.png', 'https://foo.com/p')).toBe('https://foo.com/a.png')
        expect(absolutizeUrl('javascript:alert(1)', 'https://foo.com')).toBeNull()
    })

    it('파비콘 태그 없으면 favicon.ico 추정', () => {
        expect(pickFaviconHref('<html></html>', 'https://foo.com/x')).toBe('https://foo.com/favicon.ico')
    })
})
