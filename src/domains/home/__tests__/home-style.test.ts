// /home 모양은 큐리어스 본체 디자인 토대를 따른다 (대표 지시 0929). 로고 글자는 큐리 브랜드 초록, 활동 칸은 스크롤 없이
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/app/home/home.css', 'utf8')

describe('/home follows the Curious design system', () => {
    it('uses the Curious primary green and neutral tokens', () => {
        expect(css).toContain('--hm-p: #03C124')
        expect(css).toContain('--hm-n900: #171717')
        expect(css).toContain('max-width: 1200px')
    })
    it('logo text stays in the curi brand green, not black', () => {
        expect(css).toMatch(/\.hm-logo \{[^}]*color: var\(--hm-brand\)/)
        expect(css).toContain('--hm-brand: var(--연두, #22c55e)')
        expect(css).not.toMatch(/\.hm-logo span \{ display: none/)
    })
    it('feed box has no inner scroll', () => {
        expect(css).not.toMatch(/\.hm-feed-list \{[^}]*overflow-y/)
    })
})
