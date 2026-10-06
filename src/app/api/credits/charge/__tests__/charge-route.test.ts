// 클로버 충전: 승인 후 지급 전에 끊겨도 다시 시도하면 받는다 + 같은 주문번호 두 번 지급 막기
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
    getPayment: vi.fn(),
    confirmPayment: vi.fn(),
    rpc: vi.fn(),
    already: null as unknown,
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/toss', () => ({ getPayment: h.getPayment, confirmPayment: h.confirmPayment }))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => {
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'eq']) q[m] = () => q
        q.maybeSingle = async () => ({ data: h.already })
        q.insert = async () => ({ error: null })
        return { from: () => q, rpc: h.rpc }
    },
}))
vi.mock('@/domains/credit/packs', () => ({
    isValidPackId: (id: string) => id === 'p10',
    getPack: () => ({ id: 'p10', clovers: 200, won: 9900 }),
    cloverSaleAllowed: (at: string | null) => !!at && at < '2026-10-03',
    cloverOrderStartedAt: () => null,
}))

import { POST } from '../route'

const call = () => POST(new Request('https://x.test', {
    method: 'POST', body: JSON.stringify({ paymentKey: 'pk', orderId: 'clover_p10_1', amount: 9900, packId: 'p10' }),
}) as never)

beforeEach(() => {
    h.already = null
    h.getPayment.mockReset()
    h.confirmPayment.mockReset().mockResolvedValue({ totalAmount: 9900, receipt: { url: 'r' } })
    h.rpc.mockReset().mockResolvedValue({ data: 1200, error: null })
})

describe('클로버 충전 /api/credits/charge', () => {
    it('토스 조회가 같은 주문·같은 금액 DONE 이면 승인을 건너뛰고 지급만 한다(판매 끝난 뒤여도)', async () => {
        h.getPayment.mockResolvedValue({ status: 'DONE', orderId: 'clover_p10_1', totalAmount: 9900, requestedAt: '2026-10-05' })
        const res = await call()
        expect(h.confirmPayment).not.toHaveBeenCalled()
        expect(h.rpc).toHaveBeenCalledWith('grant_clover_purchase', { p_user: 'u1', p_order: 'clover_p10_1', p_amount: 200 })
        expect(await res.json()).toMatchObject({ success: true, clovers: 200, balance: 1200 })
    })

    it('아직 승인 전이면 승인 후 지급', async () => {
        h.getPayment.mockResolvedValue({ status: 'READY', orderId: 'clover_p10_1', totalAmount: 9900, requestedAt: '2026-10-01' })
        const res = await call()
        expect(h.confirmPayment).toHaveBeenCalledTimes(1)
        expect(res.status).toBe(200)
    })

    it('지급 함수가 null(이미 지급) 이면 두 번 주지 않는다', async () => {
        h.getPayment.mockResolvedValue({ status: 'DONE', orderId: 'clover_p10_1', totalAmount: 9900, requestedAt: '2026-10-01' })
        h.rpc.mockResolvedValue({ data: null, error: null })
        expect(await (await call()).json()).toEqual({ success: true, alreadyDone: true })
    })

    it('다른 주문의 DONE 결제로는 승인을 건너뛰지 않는다', async () => {
        h.getPayment.mockResolvedValue({ status: 'DONE', orderId: 'other', totalAmount: 9900, requestedAt: '2026-10-01' })
        await call()
        expect(h.confirmPayment).toHaveBeenCalledTimes(1)
    })

    it('판매 끝난 뒤 연 주문(아직 승인 전)은 승인하지 않는다', async () => {
        h.getPayment.mockResolvedValue({ status: 'READY', orderId: 'clover_p10_1', totalAmount: 9900, requestedAt: '2026-10-05' })
        const res = await call()
        expect(res.status).toBe(410)
        expect(h.confirmPayment).not.toHaveBeenCalled()
        expect(h.rpc).not.toHaveBeenCalled()
    })
})
