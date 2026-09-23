import { describe, it, expect } from 'vitest'
import { formatMessageTime } from '../message-time'

describe('formatMessageTime', () => {
    it('서울 시각으로 오후/오전 표기', () => {
        // 2026-09-23 08:28 UTC = 서울 오후 5:28
        expect(formatMessageTime('2026-09-23T08:28:00.000Z')).toBe('오후 5:28')
        // 2026-09-23 00:05 UTC = 서울 오전 9:05
        expect(formatMessageTime('2026-09-23T00:05:00.000Z')).toBe('오전 9:05')
    })

    it('없거나 깨진 값은 빈 문자열', () => {
        expect(formatMessageTime(undefined)).toBe('')
        expect(formatMessageTime(null)).toBe('')
        expect(formatMessageTime('')).toBe('')
        expect(formatMessageTime('not-a-date')).toBe('')
    })

    it('정오는 오후 12시, 자정은 오전 12시', () => {
        // 2026-09-23 03:00 UTC = 서울 오후 12:00
        expect(formatMessageTime('2026-09-23T03:00:00.000Z')).toBe('오후 12:00')
        // 2026-09-22 15:00 UTC = 서울 오전 12:00
        expect(formatMessageTime('2026-09-22T15:00:00.000Z')).toBe('오전 12:00')
    })
})
