import { describe, it, expect } from 'vitest'
import { buildGuestLoginUrl, shouldShowGuestSignupCard, onboardingPathWithNext } from '../guestSignup'

describe('guestSignup', () => {
    it('로그인 주소에 돌아올 봇 주소와 ref 를 그대로 싣는다', () => {
        const u = buildGuestLoginUrl('kakao', '/chat/b1?ref=ABC&utm_source=bot_share')
        expect(u.startsWith('/login?provider=kakao&next=')).toBe(true)
        const next = new URLSearchParams(u.split('?')[1]).get('next')
        expect(next).toBe('/chat/b1?ref=ABC&utm_source=bot_share')
    })
    it('남의 사이트 주소는 막는다', () => {
        expect(buildGuestLoginUrl('google', '//evil.com')).toBe('/login?provider=google&next=%2Fos')
    })
    it('3번째부터 카드', () => {
        expect(shouldShowGuestSignupCard({ isGuest: true, sentCount: 2, limit: 7 })).toBe(false)
        expect(shouldShowGuestSignupCard({ isGuest: true, sentCount: 3, limit: 7 })).toBe(true)
        expect(shouldShowGuestSignupCard({ isGuest: false, sentCount: 9, limit: 7 })).toBe(false)
        expect(shouldShowGuestSignupCard({ isGuest: true, sentCount: 2, limit: 2 })).toBe(true)
    })
    it('온보딩 주소에 next 를 싣는다', () => {
        expect(onboardingPathWithNext('/os/start', '/chat/b1?ref=A')).toBe('/os/start?next=%2Fchat%2Fb1%3Fref%3DA')
        expect(onboardingPathWithNext('/os/start', '/os')).toBe('/os/start')
        expect(onboardingPathWithNext('/os/start', 'https://x')).toBe('/os/start')
    })
})
