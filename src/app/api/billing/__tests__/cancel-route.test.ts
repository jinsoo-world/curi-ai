// 해지 창구: 갱신 처리 중에도 해지가 영영 막히지 않게(신청을 받고 처리 끝나면 해지)
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
    sub: null as null | Record<string, unknown>,
    cancelSubscription: vi.fn(),
    requestCancelDuringRenew: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/slack', () => ({ sendErrorAlert: vi.fn(async () => {}) }))
vi.mock('@/domains/subscription', () => ({
    getActiveSubscription: async () => h.sub,
    cancelSubscription: h.cancelSubscription,
    requestCancelDuringRenew: h.requestCancelDuringRenew,
}))

import { POST } from '../cancel/route'

const call = () => POST(new Request('https://x.test/api/billing/cancel', { method: 'POST' }) as never)
const sub = (status: string) => ({ id: 's1', status, current_period_end: '2026-11-05T00:00:00Z' })

beforeEach(() => {
    h.cancelSubscription.mockReset().mockResolvedValue(true)
    h.requestCancelDuringRenew.mockReset().mockResolvedValue(true)
})

describe('해지 창구 /api/billing/cancel', () => {
    it('active 면 바로 해지', async () => {
        h.sub = sub('active')
        const res = await call()
        expect(res.status).toBe(200)
        expect(h.cancelSubscription).toHaveBeenCalledWith(expect.anything(), 's1')
    })
    for (const st of ['renewing', 'renew_paid_unsynced', 'renew_needs_review']) {
        it(`${st} 면 해지 신청을 받는다(202)`, async () => {
            h.sub = sub(st)
            const res = await call()
            expect(res.status).toBe(202)
            expect(h.requestCancelDuringRenew).toHaveBeenCalledWith(expect.anything(), 's1')
            expect((await res.json()).message).toContain('해지 신청을 받았어요')
        })
    }
    it('active 였는데 그사이 갱신이 잡았으면(0줄) 해지 신청으로 받는다', async () => {
        h.sub = sub('active')
        h.cancelSubscription.mockResolvedValue(false)
        const res = await call()
        expect(res.status).toBe(202)
        expect(h.requestCancelDuringRenew).toHaveBeenCalled()
    })
    it('이미 해지면 400', async () => {
        h.sub = sub('canceled')
        expect((await call()).status).toBe(400)
    })
})
