import { describe, it, expect } from 'vitest'
import {
    PLANS, getPlan, isPaidPlanId, planLimits, makePlanOrderId, planIdFromOrderId, planOrderName, resolvePlan,
} from '../plan'

describe('os/plan — 요금제 표 (무료 / 베이직 29,000 / 프로 99,000)', () => {
    it('요금제는 3개, 가격은 0 / 29,000 / 99,000', () => {
        expect(PLANS).toHaveLength(3)
        expect(PLANS.map(p => p.id)).toEqual(['free', 'basic', 'pro'])
        expect(PLANS.map(p => p.price)).toEqual([0, 29000, 99000])
    })

    it('대표 확정 0923 한도: 무료 주 100번, 베이직 주 500번, 프로 주 1,500번 (5시간 창은 주간의 1/5)', () => {
        expect(planLimits('free')).toEqual({ limit5h: 20, limitWeek: 100, maxBots: 4 })
        expect(planLimits('basic')).toEqual({ limit5h: 100, limitWeek: 500, maxBots: 10 })
        expect(planLimits('pro')).toEqual({ limit5h: 300, limitWeek: 1500, maxBots: null })
    })

    it('유료 요금제만 결제 가능. 무료는 결제 대상이 아니다', () => {
        expect(isPaidPlanId('basic')).toBe(true)
        expect(isPaidPlanId('pro')).toBe(true)
        expect(isPaidPlanId('free')).toBe(false)
        expect(isPaidPlanId('gold')).toBe(false)
        expect(isPaidPlanId(null)).toBe(false)
        expect(getPlan('basic')?.price).toBe(29000)
        expect(getPlan('nope')).toBeUndefined()
    })

    it('주문번호는 plan_<요금제>_ 로 시작하고, 거꾸로 요금제를 알아낼 수 있다', () => {
        const id = makePlanOrderId('basic', 1700000000000, 'abc123')
        expect(id).toBe('plan_basic_1700000000000_abc123')
        expect(planIdFromOrderId(id)).toBe('basic')
        expect(planIdFromOrderId('plan_pro_1_x')).toBe('pro')
        // 클로버 주문(clover_…)이나 엉뚱한 글은 null → 클로버 지급 로직과 섞이지 않는다
        expect(planIdFromOrderId('clover_p10_1_x')).toBeNull()
        expect(planIdFromOrderId('plan_free_1_x')).toBeNull()
        expect(planIdFromOrderId(null)).toBeNull()
    })

    it('토스 결제창에 보이는 이름은 「큐리AI 베이직 1개월」', () => {
        expect(planOrderName('basic')).toBe('큐리AI 베이직 1개월')
        expect(planOrderName('pro')).toBe('큐리AI 프로 1개월')
    })

    it('DB 행이 없거나 기한이 지났으면 무료로 본다', () => {
        const now = new Date('2026-09-23T00:00:00Z')
        expect(resolvePlan(null, now)).toEqual({ plan: 'free', expiresAt: null })
        expect(resolvePlan({ plan: 'basic', expires_at: '2026-10-23T00:00:00Z' }, now)).toEqual({ plan: 'basic', expiresAt: '2026-10-23T00:00:00.000Z' })
        expect(resolvePlan({ plan: 'pro', expires_at: '2026-09-01T00:00:00Z' }, now)).toEqual({ plan: 'free', expiresAt: null })
        expect(resolvePlan({ plan: 'gold', expires_at: null }, now)).toEqual({ plan: 'free', expiresAt: null })
    })
})
