import { describe, it, expect } from 'vitest'
import { getPlan, isValidPlanType, LEADER_PLAN_TYPES, type PlanType } from '../types'

/**
 * 리더 구독(스타터·프로)을 결제에 연결하면서 만든 시험.
 * 대표 확정 2026-09-14 = 「리더도 구독제로 가. 수수료는 1.5%만.」
 */
describe('요금제 조회 — 한 곳에서만 나온다', () => {
    it('네 가지 요금제를 모두 찾을 수 있다', () => {
        const 요금제들: PlanType[] = ['monthly', 'annual', 'starter', 'pro']
        for (const t of 요금제들) {
            const p = getPlan(t)
            expect(p, `${t} 요금제를 못 찾았다`).toBeTruthy()
            expect(p!.price).toBeGreaterThan(0)
            expect(p!.periodDays).toBeGreaterThan(0)
        }
    })

    it('리더 요금제 값이 정해진 대로다 (스타터 9,900 · 프로 19,900)', () => {
        expect(getPlan('starter')!.price).toBe(9900)
        expect(getPlan('pro')!.price).toBe(19900)
    })

    it('리더 요금제는 30일짜리다', () => {
        expect(getPlan('starter')!.periodDays).toBe(30)
        expect(getPlan('pro')!.periodDays).toBe(30)
    })

    it('없는 요금제를 넣으면 아무것도 주지 않는다', () => {
        expect(getPlan('없는것' as PlanType)).toBeUndefined()
        // 브라우저가 보내는 값을 그대로 믿으면 공짜 구독이 만들어진다
        expect(isValidPlanType('없는것')).toBe(false)
        expect(isValidPlanType('')).toBe(false)
        expect(isValidPlanType(null)).toBe(false)
        expect(isValidPlanType(123)).toBe(false)
    })

    it('네 가지는 모두 통과시킨다', () => {
        for (const t of ['monthly', 'annual', 'starter', 'pro']) {
            expect(isValidPlanType(t), `${t} 가 막혔다`).toBe(true)
        }
    })

    it('리더 요금제가 무엇인지 구분할 수 있다', () => {
        expect(LEADER_PLAN_TYPES).toContain('starter')
        expect(LEADER_PLAN_TYPES).toContain('pro')
        expect(LEADER_PLAN_TYPES).not.toContain('monthly')
    })
})
