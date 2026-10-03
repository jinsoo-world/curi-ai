// /home 모양 규칙 (대표 지시 0929 구성 + 1003 큐리어스 본체 디자인 시스템): 탈잉 첫 화면 구성, 곳은 아이콘 알약 칸, 주소는 칩, 못 읽는다는 말 없음, 로고 글자는 브랜드 초록
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { HOME_LINK_LINES } from '../link-guide'
import { cleanLinkTitle, homeLinkFallbackTitle, homeLinkPlatform, looksLikeLink, splitLinks } from '../link-chip'
import { HOME_COPY } from '../copy'

const css = readFileSync('src/app/home/home.css', 'utf8')
const make = readFileSync('src/components/home/HomeMake.tsx', 'utf8')

describe('/home look', () => {
    it('curious design-system tokens (1003): neutral 회색, 고른 탭은 초록 테두리', () => {
        expect(css).toContain('--hm-gray: var(--color-neutral-50)')
        expect(css).toContain('--hm-band: var(--color-neutral-100)')
        expect(css).toMatch(/\.hm \.hm-tab\.on \{[^}]*background: var\(--hm-p-50\)/)
        expect(css).not.toMatch(/gradient/)
    })
    it('logo text stays in the curi brand green', () => {
        expect(css).toMatch(/\.hm-logo \{[^}]*color: var\(--hm-brand\)/)
        expect(css).toContain('--hm-brand: var(--color-primary-500)')
    })
    it('feed box has no inner scroll', () => {
        expect(css).not.toMatch(/\.hm-feed-list \{[^}]*overflow-y/)
    })
    it('source picker uses icons and links become pills', () => {
        expect(make).toContain('HomeSourceIcon')
        expect(make).toContain('hm-pill')
        expect(make).toContain('/api/home/link-title')
        expect(HOME_COPY.multi).toBe('여러 자료 입력 가능')
    })
    it('never says a link cannot be read', () => {
        for (const l of Object.values(HOME_LINK_LINES)) expect(l).not.toMatch(/못 읽|붙여 넣어/)
        expect(make).not.toContain('needPaste')
    })
})

describe('link chips', () => {
    it.each([
        ['https://www.youtube.com/@curi', 'youtube', '유튜브 @curi'],
        ['https://youtu.be/abc', 'youtube', '유튜브 영상'],
        ['instagram.com/abc', 'instagram', '인스타그램 @abc'],
        ['https://www.threads.net/@abc', 'threads', '스레드 @abc'],
        ['https://blog.naver.com/abc', 'blog', '네이버 블로그 abc'],
        ['abc.tistory.com', 'tistory', '티스토리 abc'],
        ['brunch.co.kr/@abc', 'brunch', '브런치 @abc'],
        ['https://smartstore.naver.com/shop/products/1', 'shop', 'smartstore.naver.com/shop'],
        ['https://example.com', 'web', 'example.com'],
    ])('%s', (url, platform, title) => {
        expect(homeLinkPlatform(url)).toBe(platform)
        expect(homeLinkFallbackTitle(url)).toBe(title)
    })
    it('splits pasted text into links and the rest', () => {
        expect(splitLinks('instagram.com/a youtube.com/@b 안녕하세요.')).toEqual({ links: ['instagram.com/a', 'youtube.com/@b'], rest: '안녕하세요.' })
        expect(looksLikeLink('안녕하세요.')).toBe(false)
        expect(looksLikeLink('curi_ai')).toBe(false)
    })
    it('cleans titles and drops generic ones', () => {
        expect(cleanLinkTitle('내 영상 - YouTube')).toBe('내 영상')
        expect(cleanLinkTitle('Instagram')).toBeNull()
        expect(cleanLinkTitle('가·나—다')).toBe('가 나 다')
        expect(cleanLinkTitle('(@curi_ai) \u2022 Instagram 사진 및 동영상')).toBe('@curi_ai')
        expect(cleanLinkTitle('큐리 (@curi_ai) \u2022 Instagram photos and videos')).toBe('큐리 (@curi_ai)')
        expect((cleanLinkTitle('가'.repeat(120)) ?? '').length).toBe(80)
    })
})
