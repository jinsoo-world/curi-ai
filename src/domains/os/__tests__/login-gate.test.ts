import { describe, it, expect } from 'vitest'
import { checkAudience, isLoginGateReply, loginHref, LOGIN_REQUIRED_MESSAGE } from '../audience'

describe('로그인 전 막힌 답 알아보기 (대화 화면이 로그인 단추를 붙인다)', () => {
    it('Public 봇 + 로그인 전 = login_required + 같은 안내 글', () => {
        const r = checkAudience({ level: 'public', isOwner: false, isLoggedIn: false, inAllowedGroup: false })
        expect(r.reason).toBe('login_required')
        expect(r.message).toBe(LOGIN_REQUIRED_MESSAGE)
    })

    it('새 서버: audienceReason 으로 알아본다', () => {
        expect(isLoginGateReply({ audienceBlocked: true, audienceReason: 'login_required', text: '아무 글' })).toBe(true)
        expect(isLoginGateReply({ audienceBlocked: true, audienceReason: 'just_me_blocked', text: LOGIN_REQUIRED_MESSAGE })).toBe(false)
    })

    it('옛 서버(까닭 없음): 글자로 알아본다', () => {
        expect(isLoginGateReply({ audienceBlocked: true, text: LOGIN_REQUIRED_MESSAGE })).toBe(true)
        expect(isLoginGateReply({ audienceBlocked: true, text: '이 봇은 주인만 대화할 수 있어요' })).toBe(false)
    })

    it('막힘 표시가 없으면 보통 답이다', () => {
        expect(isLoginGateReply({ text: LOGIN_REQUIRED_MESSAGE })).toBe(false)
    })

    it('로그인 주소는 돌아올 곳과 고른 단추를 들고 간다', () => {
        expect(loginHref('/os/chat/abc', 'kakao')).toBe('/login?next=%2Fos%2Fchat%2Fabc&provider=kakao')
        expect(loginHref('', 'google')).toBe('/login?next=%2Fos&provider=google')
        expect(loginHref('/os')).toBe('/login?next=%2Fos')
    })
})
