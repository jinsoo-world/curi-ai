import { describe, it, expect } from 'vitest'
import { maskPhone, maskEmail, toHint } from '../mask'

describe('messaging/mask — 화면·로그에는 끝자리만', () => {
    it('전화번호는 뒤 4자만 보인다', () => {
        expect(maskPhone('01012345678')).toBe('010-****-5678')
        expect(maskPhone('010-1234-5678')).toBe('010-****-5678')
    })
    it('전화번호가 없거나 이상하면 빈 문자열', () => {
        expect(maskPhone(null)).toBe('')
        expect(maskPhone('12')).toBe('')
    })
    it('이메일은 앞 2자만 남긴다', () => {
        expect(maskEmail('jin@mission-driven.kr')).toBe('ji***@mission-driven.kr')
        expect(maskEmail('a@b.c')).toBe('a***@b.c')
        expect(maskEmail(undefined)).toBe('')
    })
    it('로그용 힌트는 무엇이든 끝 4자만', () => {
        expect(toHint('01012345678')).toBe('5678')
        expect(toHint('jin@mission-driven.kr')).toBe('n.kr')
        expect(toHint('https://fcm.googleapis.com/fcm/send/abcdefg')).toBe('defg')
        expect(toHint('')).toBe('')
        expect(toHint(undefined)).toBe('')
    })
})
