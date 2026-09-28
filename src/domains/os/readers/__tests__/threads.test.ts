import { describe, it, expect } from 'vitest'
import { extractThreadsPosts, extractThreadsBio } from '../threads'

describe('스레드 공개 글 뽑기', () => {
    const html = `<meta property="og:description" content="138 Followers &#x2022; &#xad81;&#xae08;" />
    {"caption":{"text":"\\uc815\\ubd80\\uc9c0\\uc6d0\\uc0ac\\uc5c5\\uc73c\\ub85c 5\\uc5b5 \\ubc1b\\uc73c\\uba74\\uc11c \\ub290\\ub080 \\uc810\\n\\n\\uccab\\uc9f8"}}
    {"caption":{"text":"\\uc815\\ubd80\\uc9c0\\uc6d0\\uc0ac\\uc5c5\\uc73c\\ub85c 5\\uc5b5 \\ubc1b\\uc73c\\uba74\\uc11c \\ub290\\ub080 \\uc810\\n\\n\\uccab\\uc9f8"}}
    {"text":"short"} {"text":"https://example.com/aaaaaaaaaaaaaaaaaaaaaa"}
    {"caption":{"text":"\\ub9e4\\ucd9c\\uc774 \\uc804\\ubd80 \\ud68c\\uc0ac\\uc758 \\uc218\\uc775\\uc774 \\ub418\\uc9c0\\ub294 \\uc54a\\ub294\\ub2e4 \\uae38\\uac8c"}}`
    it('본문만 뽑고 같은 글, 짧은 글, 주소는 뺀다', () => {
        const p = extractThreadsPosts(html)
        expect(p).toHaveLength(2)
        expect(p[0].text.startsWith('정부지원사업으로 5억')).toBe(true)
        expect(p[1].text).toContain('매출이 전부')
    })
    it('소개 한 줄을 읽는다', () => {
        expect(extractThreadsBio(html)).toBe('138 Followers • 궁금')
    })
})
