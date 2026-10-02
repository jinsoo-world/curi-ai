// /api/os/plan — 웹(토스) 결제가 앱 구독과 겹치지 않게
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { row: unknown } = { row: null }
const confirmPayment = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        from: () => {
            const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: state.row, error: null }), upsert: async () => ({ error: null }) }
            return q
        },
    }),
}))
vi.mock('@/lib/toss', () => ({ confirmPayment: (...a: unknown[]) => confirmPayment(...a) }))

import { GET, POST } from '@/app/api/os/plan/route'

const post = (body: unknown) => POST(new Request('https://x/api/os/plan', { method: 'POST', body: JSON.stringify(body) }) as never)

beforeEach(() => { state.row = null; confirmPayment.mockReset() })

describe('/api/os/plan', () => {
    it('앱에서 구독 중이면 토스 승인 전에 409 와 안내 문구', async () => {
        state.row = { plan: 'basic', expires_at: '2099-01-01T00:00:00Z', last_order_id: 'revenuecat:evt-1' }
        const res = await post({ paymentKey: 'pk', orderId: 'plan_pro_1_x', amount: 39000, planId: 'pro' })
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe('앱에서 구독 중이에요. 앱스토어나 플레이스토어에서 먼저 해지해 주세요')
        expect(confirmPayment).not.toHaveBeenCalled()
    })

    it('GET 은 어디서 열린 요금제인지(source)도 알려 준다', async () => {
        state.row = { plan: 'basic', expires_at: '2099-01-01T00:00:00Z', last_order_id: 'revenuecat:evt-1' }
        const body = await (await GET()).json()
        expect(body).toMatchObject({ plan: 'basic', source: 'revenuecat', adFree: true })
    })
})
