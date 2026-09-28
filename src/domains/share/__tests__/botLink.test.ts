import { describe, it, expect } from 'vitest'
import { buildBotShareUrl, shouldShowFirstBotCard } from '../botLink'

describe('buildBotShareUrl', () => {
    it('붙여야 할 값을 모두 붙인다', () => {
        const u = new URL(buildBotShareUrl({ origin: 'https://curi-ai.com/', botId: 'b1', ownerCode: 'OWNER1', sharerCode: 'ME22' }))
        expect(u.pathname).toBe('/chat/b1')
        expect(u.searchParams.get('ref')).toBe('ME22')
        expect(u.searchParams.get('utm_source')).toBe('bot_share')
        expect(u.searchParams.get('utm_medium')).toBe('share')
        expect(u.searchParams.get('utm_content')).toBe('OWNER1')
    })
    it('주인 코드가 없으면 봇 id, 비회원이면 ref 없음', () => {
        const u = new URL(buildBotShareUrl({ origin: 'https://curi-ai.com', botId: 'b1' }))
        expect(u.searchParams.get('utm_content')).toBe('b1')
        expect(u.searchParams.has('ref')).toBe(false)
    })
})

describe('shouldShowFirstBotCard', () => {
    it('첫 봇 대화에서 한 번만', () => {
        expect(shouldShowFirstBotCard({ myBotIds: ['a'], currentBotId: 'a', alreadyShown: false })).toBe(true)
        expect(shouldShowFirstBotCard({ myBotIds: ['a'], currentBotId: 'a', alreadyShown: true })).toBe(false)
        expect(shouldShowFirstBotCard({ myBotIds: ['a', 'b'], currentBotId: 'a', alreadyShown: false })).toBe(false)
        expect(shouldShowFirstBotCard({ myBotIds: ['a'], currentBotId: 'x', alreadyShown: false })).toBe(false)
    })
})
