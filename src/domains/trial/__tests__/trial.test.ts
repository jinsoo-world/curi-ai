import { describe, it, expect } from 'vitest'
import { trialEndsAt, isTrialActive, trialDaysLeft, TRIAL_DAYS } from '../index'

describe('무료 체험권 기간 계산', () => {
    const 기준 = new Date('2026-09-14T23:30:00+09:00')

    it('받은 날부터 7일 뒤에 끝난다', () => {
        const 끝 = trialEndsAt(기준)
        expect(끝.getTime() - 기준.getTime()).toBe(TRIAL_DAYS * 24 * 60 * 60 * 1000)
    })

    it('끝나는 시각 전이면 체험 중이다', () => {
        const 끝 = trialEndsAt(기준).toISOString()
        expect(isTrialActive(끝, 기준)).toBe(true)
    })

    it('끝나는 시각을 지나면 끝난다', () => {
        const 끝 = trialEndsAt(기준)
        const 하루뒤 = new Date(끝.getTime() + 1000)
        expect(isTrialActive(끝.toISOString(), 하루뒤)).toBe(false)
    })

    it('받은 적 없으면 체험 중이 아니다', () => {
        expect(isTrialActive(null)).toBe(false)
        expect(isTrialActive(undefined)).toBe(false)
        expect(isTrialActive('말이 안 되는 값')).toBe(false)
    })

    it('남은 날은 올림으로 센다', () => {
        const 끝 = trialEndsAt(기준)
        expect(trialDaysLeft(끝.toISOString(), 기준)).toBe(7)

        // 끝나기 반나절 전 = 남은 건 0.5일. 올림해서 「1일 남음」으로 보여준다
        const 반나절남음 = new Date(끝.getTime() - 0.5 * 24 * 60 * 60 * 1000)
        expect(trialDaysLeft(끝.toISOString(), 반나절남음)).toBe(1)

        // 시작 반나절 뒤 = 남은 건 6.5일 → 7일로 보여준다
        const 반나절썼음 = new Date(기준.getTime() + 0.5 * 24 * 60 * 60 * 1000)
        expect(trialDaysLeft(끝.toISOString(), 반나절썼음)).toBe(7)

        expect(trialDaysLeft(끝.toISOString(), new Date(끝.getTime() + 1))).toBe(0)
    })
})
