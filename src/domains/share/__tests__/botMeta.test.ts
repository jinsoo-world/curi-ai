import { describe, it, expect } from 'vitest'
import { botShareMeta, botOneLiner, absoluteUrl, GENERIC_BOT_META } from '../botMeta'

describe('botShareMeta', () => {
    it('공개 봇 = 이름 | 큐리AI, 한 줄, 봇 그림 주소', () => {
        const m = botShareMeta({ id: 'b 1', name: '김선생', title: '수학을 쉽게' }, 'https://x.com/')
        expect(m.title).toBe('김선생 | 큐리AI')
        expect(m.description).toBe('수학을 쉽게')
        expect(m.image).toBe('https://x.com/api/og/bot/b%201')
        expect(m.isPublic).toBe(true)
    })
    it('비공개·없는 봇 = 기본 카드', () => {
        const m = botShareMeta(null, 'https://x.com')
        expect(m.title).toBe(GENERIC_BOT_META.title)
        expect(m.image).toBeNull()
    })
    it('한 줄이 없으면 기본 문구, 길면 자른다', () => {
        expect(botOneLiner({ id: '1', name: '봇' })).toContain('봇')
        expect(botOneLiner({ id: '1', name: '봇', description: 'a'.repeat(200) }, 10)).toHaveLength(10)
    })
    it('absoluteUrl', () => {
        expect(absoluteUrl('https://x.com', '/a.png')).toBe('https://x.com/a.png')
        expect(absoluteUrl('https://x.com', 'https://y.com/a.png')).toBe('https://y.com/a.png')
        expect(absoluteUrl('https://x.com', 'data:x')).toBeNull()
    })
})
