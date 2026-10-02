import { describe, it, expect } from 'vitest'
import {
    PLANS, getPlan, isPaidPlanId, planLimits, makePlanOrderId, planIdFromOrderId, planOrderName, resolvePlan,
    planRank, canBuyPlan, planPriceText, nextPlanPeriod, planAdFree, planEntitlement,
} from '../plan'

describe('os/plan — 요금제 표 (무료 / 베이직 9,900 / 프로 39,000, 대표 결정 1002)', () => {
    it('요금제는 3개, 가격은 0 / 9,900 / 39,000', () => {
        expect(PLANS).toHaveLength(3)
        expect(PLANS.map(p => p.id)).toEqual(['free', 'basic', 'pro'])
        expect(PLANS.map(p => p.price)).toEqual([0, 9900, 39000])
    })

    it('화면 가격 글자는 「월 9,900원」「월 39,000원」, 무료는 「0원」', () => {
        expect(PLANS.map(planPriceText)).toEqual(['0원', '월 9,900원', '월 39,000원'])
    })

    it('순서는 무료 < 베이직 < 프로', () => {
        expect(planRank('free')).toBeLessThan(planRank('basic'))
        expect(planRank('basic')).toBeLessThan(planRank('pro'))
    })

    it('결제 단추는 지금보다 위 요금제에만 보인다 (내리기는 남은 기간을 날리므로 막는다)', () => {
        expect(canBuyPlan('free', 'basic')).toBe(true)
        expect(canBuyPlan('free', 'pro')).toBe(true)
        expect(canBuyPlan('basic', 'pro')).toBe(true)
        expect(canBuyPlan('basic', 'basic')).toBe(false)
        expect(canBuyPlan('pro', 'basic')).toBe(false)
        expect(canBuyPlan('free', 'free')).toBe(false)
    })

    it('대표 결정 0928 한도: 월간 무료 30, 베이직 370, 프로 1,250', () => {
        expect(planLimits('free')).toEqual({ limitMonth: 30, maxBots: 4 })
        expect(planLimits('basic')).toEqual({ limitMonth: 370, maxBots: 10 })
        expect(planLimits('pro')).toEqual({ limitMonth: 1250, maxBots: null })
    })

    it('유료 요금제만 결제 가능. 무료는 결제 대상이 아니다', () => {
        expect(isPaidPlanId('basic')).toBe(true)
        expect(isPaidPlanId('pro')).toBe(true)
        expect(isPaidPlanId('free')).toBe(false)
        expect(isPaidPlanId('gold')).toBe(false)
        expect(isPaidPlanId(null)).toBe(false)
        expect(getPlan('basic')?.price).toBe(9900)
        expect(getPlan('pro')?.price).toBe(39000)
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

    it('결제 뒤 끝나는 날: 처음이면 한 달 뒤, 같은 요금제를 이어 사면 남은 기간 뒤에 한 달을 붙인다', () => {
        const now = new Date('2026-10-02T00:00:00Z')
        expect(nextPlanPeriod(null, 'basic', now)).toEqual({ ok: true, expiresAt: new Date('2026-11-02T00:00:00Z') })
        // 기한 지난 프로 → 무료로 보니 베이직을 새로 산다
        expect(nextPlanPeriod({ plan: 'pro', expires_at: '2026-09-01T00:00:00Z' }, 'basic', now)).toEqual({ ok: true, expiresAt: new Date('2026-11-02T00:00:00Z') })
        // 베이직이 10/20 까지 남았는데 베이직을 또 사면 11/20 까지
        expect(nextPlanPeriod({ plan: 'basic', expires_at: '2026-10-20T00:00:00Z' }, 'basic', now)).toEqual({ ok: true, expiresAt: new Date('2026-11-20T00:00:00Z') })
        // 올리기(베이직 → 프로)는 오늘부터 한 달
        expect(nextPlanPeriod({ plan: 'basic', expires_at: '2026-10-20T00:00:00Z' }, 'pro', now)).toEqual({ ok: true, expiresAt: new Date('2026-11-02T00:00:00Z') })
    })

    it('쓰고 있는 프로가 남았는데 베이직을 사면 막는다 (돈 받기 전에)', () => {
        const now = new Date('2026-10-02T00:00:00Z')
        expect(nextPlanPeriod({ plan: 'pro', expires_at: '2026-10-20T00:00:00Z' }, 'basic', now)).toEqual({ ok: false, reason: 'downgrade' })
        // 기한 없는 베이직(직접 넣어 준 것)을 또 사면 기간이 오히려 줄어드니 막는다
        expect(nextPlanPeriod({ plan: 'basic', expires_at: null }, 'basic', now)).toEqual({ ok: false, reason: 'already' })
    })

    it('광고 없애기: 베이직·프로는 광고 없음, 무료는 광고 있음 (대표 결정 1002)', () => {
        expect(planAdFree('free')).toBe(false)
        expect(planAdFree('basic')).toBe(true)
        expect(planAdFree('pro')).toBe(true)
        expect(PLANS.map(p => p.adFree)).toEqual([false, true, true])
        expect(getPlan('basic')?.perks).toContain('광고 없이 쓰기')
        expect(getPlan('pro')?.perks).toContain('광고 없이 쓰기')
        expect(getPlan('free')?.perks).not.toContain('광고 없이 쓰기')
    })

    it('앱·웹이 같은 답을 보도록 지금 권한 한 묶음 (planEntitlement)', () => {
        const now = new Date('2026-10-02T00:00:00Z')
        expect(planEntitlement(null, now)).toEqual({ plan: 'free', expiresAt: null, adFree: false, source: null, limits: { limitMonth: 30, maxBots: 4 } })
        expect(planEntitlement({ plan: 'basic', expires_at: '2026-11-02T00:00:00Z', last_order_id: 'revenuecat:evt-1' }, now))
            .toEqual({ plan: 'basic', expiresAt: '2026-11-02T00:00:00.000Z', adFree: true, source: 'revenuecat', limits: { limitMonth: 370, maxBots: 10 } })
        expect(planEntitlement({ plan: 'pro', expires_at: '2026-11-02T00:00:00Z', last_order_id: 'plan_pro_1_x' }, now).source).toBe('toss')
        // 기한 지난 줄은 무료, 광고 있음
        expect(planEntitlement({ plan: 'pro', expires_at: '2026-09-02T00:00:00Z', last_order_id: 'plan_pro_1_x' }, now)).toMatchObject({ plan: 'free', adFree: false, source: null })
    })
})
