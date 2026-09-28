import { describe, it, expect } from 'vitest'
import { shouldShowTwinStartCard } from '../twin-start-card'

const base = { guest: false, demo: false, hasHomeDraft: false, hasOwnBot: false, done: false }
describe('shouldShowTwinStartCard', () => {
    it('직접 만든 봇이 없는 회원에게 뜬다', () => expect(shouldShowTwinStartCard(base)).toBe(true))
    it('손님·시연·초안 있음·봇 있음·이미 봄 이면 안 뜬다', () => {
        for (const k of ['guest', 'demo', 'hasHomeDraft', 'hasOwnBot', 'done'] as const) {
            expect(shouldShowTwinStartCard({ ...base, [k]: true })).toBe(false)
        }
    })
})
