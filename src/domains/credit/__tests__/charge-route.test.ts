import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 클로버 판매 끝 — 대표 결정 2026-10-02 「웹 요금도 이거에 맞게 수정해줘. 클로버는 없애구.」
 * 새 클로버 주문은 서버가 막는다. 단 배포 전에 결제창을 연 주문은 끝까지 받아 준다(돈이 나간 사람을 막지 않는다).
 */

const getUser = vi.fn()
const confirmPayment = vi.fn()
const getPayment = vi.fn()
const 이미지급 = vi.fn()
const rpc = vi.fn()
const insert = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: () => getUser() } }) }))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        from: () => ({
            select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => 이미지급() }) }) }) }),
            insert: (row: unknown) => insert(row),
        }),
        rpc: (...a: unknown[]) => rpc(...a),
    }),
}))
vi.mock('@/lib/toss', () => ({
    confirmPayment: (...a: unknown[]) => confirmPayment(...a),
    getPayment: (...a: unknown[]) => getPayment(...a),
}))

import { POST } from '@/app/api/credits/charge/route'
import { CLOVER_SALES_ENDED_AT, cloverOrderStartedAt, cloverSaleAllowed } from '../packs'

const 끝난시각 = Date.parse(CLOVER_SALES_ENDED_AT)
const 전 = new Date(끝난시각 - 60_000).toISOString()
const 뒤 = new Date(끝난시각 + 60_000).toISOString()

function req(body: Record<string, unknown>) {
    return new Request('http://x/api/credits/charge', { method: 'POST', body: JSON.stringify(body) }) as never
}
const 주문 = (at: number) => ({ paymentKey: 'pk_1', orderId: `clover_p10_${at}_abc123`, amount: 9900, packId: 'p10' })

beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    이미지급.mockResolvedValue({ data: null })
    rpc.mockResolvedValue({ data: 300 })
    insert.mockResolvedValue({ error: null })
    confirmPayment.mockResolvedValue({ totalAmount: 9900, receipt: { url: 'r' } })
})

describe('클로버 판매 끝 판정', () => {
    it('판매 끝 시각 전에 연 주문만 받는다', () => {
        expect(cloverSaleAllowed(전)).toBe(true)
        expect(cloverSaleAllowed(뒤)).toBe(false)
        expect(cloverSaleAllowed(null)).toBe(false)
        expect(cloverSaleAllowed('엉터리')).toBe(false)
    })

    it('주문번호에 적힌 시각을 읽는다 (토스 조회가 안 될 때 대신 쓴다)', () => {
        expect(cloverOrderStartedAt('clover_p10_1700000000000_abc')).toBe(new Date(1700000000000).toISOString())
        expect(cloverOrderStartedAt('plan_basic_1700000000000_abc')).toBeNull()
        expect(cloverOrderStartedAt('clover_p10_x_abc')).toBeNull()
        expect(cloverOrderStartedAt(undefined)).toBeNull()
    })
})

describe('/api/credits/charge 새 주문 막기', () => {
    it('판매 끝 뒤에 토스 결제창을 연 주문은 410 으로 막고, 토스 승인을 부르지 않는다', async () => {
        getPayment.mockResolvedValue({ requestedAt: 뒤, orderId: 주문(끝난시각 + 60_000).orderId })
        const res = await POST(req(주문(끝난시각 + 60_000)))
        expect(res.status).toBe(410)
        const j = await res.json()
        expect(j.error).toContain('결제는 되지 않았어요')
        expect(confirmPayment).not.toHaveBeenCalled()
        expect(rpc).not.toHaveBeenCalled()
    })

    it('주문번호의 시각을 옛날로 꾸며도 토스가 적은 시각으로 판정한다', async () => {
        getPayment.mockResolvedValue({ requestedAt: 뒤 })
        const res = await POST(req(주문(끝난시각 - 86_400_000)))
        expect(res.status).toBe(410)
        expect(confirmPayment).not.toHaveBeenCalled()
    })

    it('판매 끝 전에 결제창을 연 주문은 끝까지 승인하고 클로버를 넣는다', async () => {
        getPayment.mockResolvedValue({ requestedAt: 전 })
        const res = await POST(req(주문(끝난시각 - 60_000)))
        expect(res.status).toBe(200)
        expect(confirmPayment).toHaveBeenCalledTimes(1)
        // 지급은 기록·잔액을 한 번에 하는 DB 함수(같은 주문번호 두 번 지급 막기, 2026-10-06)
        expect(rpc).toHaveBeenCalledWith('grant_clover_purchase', { p_user: 'u1', p_order: 주문(끝난시각 - 60_000).orderId, p_amount: 200 })
    })

    it('토스 조회가 실패하면 주문번호의 시각으로 판정한다', async () => {
        getPayment.mockRejectedValue(new Error('조회 실패'))
        const ok = await POST(req(주문(끝난시각 - 60_000)))
        expect(ok.status).toBe(200)
        const no = await POST(req(주문(끝난시각 + 60_000)))
        expect(no.status).toBe(410)
    })

    it('지급 함수가 아직 없으면(마이그레이션 전) 예전 두 걸음 방식으로 지급한다', async () => {
        getPayment.mockResolvedValue({ requestedAt: 전 })
        rpc.mockImplementation(async (name: string) => name === 'grant_clover_purchase'
            ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.grant_clover_purchase' } }
            : { data: 300, error: null })
        const res = await POST(req(주문(끝난시각 - 60_000)))
        expect(res.status).toBe(200)
        expect(rpc).toHaveBeenCalledWith('클로버_더하기', { 그사람: 'u1', 더할값: 200 })
        expect(insert).toHaveBeenCalledTimes(1)
    })

    it('이미 지급한 주문은 판매 끝 뒤에도 그대로 「끝났어요」를 돌려준다 (새로고침에 안전)', async () => {
        이미지급.mockResolvedValue({ data: { id: 't1' } })
        const res = await POST(req(주문(끝난시각 + 60_000)))
        expect(res.status).toBe(200)
        expect((await res.json()).alreadyDone).toBe(true)
        expect(getPayment).not.toHaveBeenCalled()
        expect(confirmPayment).not.toHaveBeenCalled()
    })
})
