import { describe, it, expect } from 'vitest'
import { getPlan, isValidPlanType, LEADER_PLAN_TYPES, CREATOR_PLANS, type PlanType } from '../types'

/**
 * 리더 구독을 결제에 연결하며 만든 시험.
 * 대표 확정 2026-09-14 = 「리더도 구독제로 가. 수수료는 1.5%만.」 → 「프로 하나만 두자.」
 */
describe('요금제 조회 — 한 곳에서만 나온다', () => {
    it('우리가 파는 요금제를 모두 찾을 수 있다', () => {
        const 요금제들: PlanType[] = ['monthly', 'annual', 'pro']
        for (const t of 요금제들) {
            const p = getPlan(t)
            expect(p, `${t} 요금제를 못 찾았다`).toBeTruthy()
            expect(p!.price).toBeGreaterThan(0)
            expect(p!.periodDays).toBeGreaterThan(0)
        }
    })

    it('리더 요금제는 하나뿐이다', () => {
        expect(LEADER_PLAN_TYPES).toHaveLength(1)
        expect(LEADER_PLAN_TYPES).toContain('pro')
        expect(Object.keys(CREATOR_PLANS)).toEqual(['pro'])
    })

    it('리더 요금제는 30일짜리이고 값이 매겨져 있다', () => {
        const p = getPlan('pro')!
        expect(p.periodDays).toBe(30)
        expect(p.price).toBeGreaterThan(0)
        // 값 자체는 대표가 정한다. 여기서는 「값이 한 곳에서만 나온다」만 지킨다.
        expect(p.price).toBe(CREATOR_PLANS.pro.price)
    })

    it('없는 요금제를 넣으면 아무것도 주지 않는다', () => {
        expect(getPlan('없는것' as PlanType)).toBeUndefined()
        // 브라우저가 보내는 값을 그대로 믿으면 공짜 구독이 만들어진다
        expect(isValidPlanType('없는것')).toBe(false)
        expect(isValidPlanType('starter')).toBe(false)  // 없앤 요금제도 막힌다
        expect(isValidPlanType('')).toBe(false)
        expect(isValidPlanType(null)).toBe(false)
        expect(isValidPlanType(123)).toBe(false)
    })

    it('파는 요금제는 모두 통과시킨다', () => {
        for (const t of ['monthly', 'annual', 'pro']) {
            expect(isValidPlanType(t), `${t} 가 막혔다`).toBe(true)
        }
    })
})
