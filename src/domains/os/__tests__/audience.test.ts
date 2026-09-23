import { describe, it, expect } from 'vitest'
import {
    AUDIENCE_LEVELS, checkAudience, cleanVisitorLimit, defaultAudienceLevel, isAudienceLevel, visitorWeeklyLimit,
} from '../audience'

describe('os/audience — 누가 이 봇과 대화할 수 있나 (Just Me / Insiders / Public / Anonymous)', () => {
    it('4단계, 델파이 문법 그대로', () => {
        expect(AUDIENCE_LEVELS).toEqual(['just_me', 'insiders', 'public', 'anonymous'])
    })

    it('기본값: 마켓 공개 봇은 Public, 내 팀 개인 봇은 Just Me', () => {
        expect(defaultAudienceLevel(true)).toBe('public')
        expect(defaultAudienceLevel(false)).toBe('just_me')
    })

    it('isAudienceLevel', () => {
        expect(isAudienceLevel('public')).toBe(true)
        expect(isAudienceLevel('insiders')).toBe(true)
        expect(isAudienceLevel('vip')).toBe(false)
        expect(isAudienceLevel(null)).toBe(false)
    })

    it('주인은 어떤 단계여도 항상 통과한다', () => {
        for (const level of AUDIENCE_LEVELS) {
            const r = checkAudience({ level, isOwner: true, isLoggedIn: false, inAllowedGroup: false })
            expect(r).toEqual({ allowed: true, reason: null, message: null })
        }
    })

    it('Just Me — 주인이 아니면 로그인 여부와 관계없이 막는다', () => {
        const r1 = checkAudience({ level: 'just_me', isOwner: false, isLoggedIn: true, inAllowedGroup: false })
        expect(r1.allowed).toBe(false)
        expect(r1.reason).toBe('just_me_blocked')
        expect(r1.message).toBe('이 봇은 주인만 대화할 수 있어요')

        const r2 = checkAudience({ level: 'just_me', isOwner: false, isLoggedIn: false, inAllowedGroup: false })
        expect(r2.allowed).toBe(false)
    })

    it('Insiders — 접근 그룹에 든 사람만 통과, 아니면 초대 문구로 막는다', () => {
        const ok = checkAudience({ level: 'insiders', isOwner: false, isLoggedIn: true, inAllowedGroup: true })
        expect(ok).toEqual({ allowed: true, reason: null, message: null })

        const blocked = checkAudience({ level: 'insiders', isOwner: false, isLoggedIn: true, inAllowedGroup: false })
        expect(blocked.allowed).toBe(false)
        expect(blocked.reason).toBe('insiders_blocked')
        expect(blocked.message).toBe('초대받은 사람만 대화할 수 있어요')
    })

    it('Public — 로그인한 누구나 통과, 손님은 로그인 안내로 막는다', () => {
        const ok = checkAudience({ level: 'public', isOwner: false, isLoggedIn: true, inAllowedGroup: false })
        expect(ok).toEqual({ allowed: true, reason: null, message: null })

        const guest = checkAudience({ level: 'public', isOwner: false, isLoggedIn: false, inAllowedGroup: false })
        expect(guest.allowed).toBe(false)
        expect(guest.reason).toBe('login_required')
        expect(guest.message).toBe('로그인하면 대화할 수 있어요')
    })

    it('Anonymous — 로그인 없이도 항상 통과', () => {
        const guest = checkAudience({ level: 'anonymous', isOwner: false, isLoggedIn: false, inAllowedGroup: false })
        expect(guest).toEqual({ allowed: true, reason: null, message: null })
        const member = checkAudience({ level: 'anonymous', isOwner: false, isLoggedIn: true, inAllowedGroup: false })
        expect(member.allowed).toBe(true)
    })

    it('visitorWeeklyLimit — 요금제 한도와 주인이 정한 한도 중 작은 값', () => {
        expect(visitorWeeklyLimit(100, null)).toBe(100)       // 정해 둔 게 없으면 요금제 한도만
        expect(visitorWeeklyLimit(100, undefined)).toBe(100)
        expect(visitorWeeklyLimit(100, 30)).toBe(30)          // 주인이 더 짜게 정함
        expect(visitorWeeklyLimit(100, 500)).toBe(100)        // 주인이 더 후하게 정해도 요금제 한도를 못 넘는다
        expect(visitorWeeklyLimit(1500, 0)).toBe(0)
        expect(visitorWeeklyLimit(100, -5)).toBe(0)           // 음수는 0으로 (방어)
    })

    it('cleanVisitorLimit — 빈 값·0 이하·숫자 아님은 한도 없음(null)', () => {
        expect(cleanVisitorLimit('')).toBeNull()
        expect(cleanVisitorLimit(null)).toBeNull()
        expect(cleanVisitorLimit(undefined)).toBeNull()
        expect(cleanVisitorLimit('0')).toBeNull()
        expect(cleanVisitorLimit(-3)).toBeNull()
        expect(cleanVisitorLimit('abc')).toBeNull()
        expect(cleanVisitorLimit('50')).toBe(50)
        expect(cleanVisitorLimit(50.7)).toBe(50)
    })

    it('방문자 봇 한도 게이트 — 한도 미설정은 통과, 사용량이 한도 이상이면 막힘', () => {
        // checkVisitorBotWeeklyLimit 의 순수 규칙 (DB 없이): limit==null → 통과, used >= limit → 막힘
        const blocked = (used: number, limit: number | null) => limit != null && used >= limit
        expect(blocked(0, null)).toBe(false)
        expect(blocked(99, null)).toBe(false)
        expect(blocked(0, 10)).toBe(false)
        expect(blocked(9, 10)).toBe(false)
        expect(blocked(10, 10)).toBe(true)
        expect(blocked(11, 10)).toBe(true)
        // 요금제 한도와 주인이 정한 한도의 min 은 visitorWeeklyLimit 이 담당
        expect(visitorWeeklyLimit(100, 10)).toBe(10)
    })

})
