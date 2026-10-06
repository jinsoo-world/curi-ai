// 토스 웹훅: 진짜 토스인지 확인(결제 조회 재확인 · 서명) + 처리 오류는 500(재전송) + 슬랙 3초
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'

const h = vi.hoisted(() => ({
    getPayment: vi.fn(),
    slack: vi.fn(async () => {}),
    alert: vi.fn(async () => {}),
    updates: [] as Record<string, unknown>[],
    updateError: null as null | { message: string },
}))

vi.mock('@/lib/toss', () => ({ getPayment: h.getPayment }))
vi.mock('@/lib/slack', async (orig) => {
    const real = await orig<typeof import('@/lib/slack')>()
    return { ...real, sendSlackNotification: h.slack, sendErrorAlert: h.alert }
})
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => {
        const q: Record<string, unknown> = {}
        q.update = (v: Record<string, unknown>) => { h.updates.push(v); return q }
        q.select = () => q
        q.eq = () => q
        q.single = async () => ({ data: null })
        q.then = (res: (v: unknown) => unknown) => Promise.resolve({ error: h.updateError }).then(res)
        return { from: () => q }
    },
}))

import { POST } from '../webhook/route'

const post = (body: unknown, headers: Record<string, string> = {}) =>
    POST(new Request('https://x.test/api/billing/webhook', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }) as never)

beforeEach(() => {
    h.getPayment.mockReset()
    h.slack.mockClear(); h.alert.mockClear()
    h.updates.length = 0
    h.updateError = null
    process.env.TOSS_WEBHOOK_SECRET = 'whk'
})

describe('토스 웹훅 /api/billing/webhook', () => {
    it('결제 상태 웹훅은 토스에 다시 물어 토스가 준 상태로 갱신한다(본문 상태는 안 믿는다)', async () => {
        h.getPayment.mockResolvedValue({ paymentKey: 'pk', orderId: 'o', status: 'CANCELED', totalAmount: 9900 })
        const res = await post({ eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'pk', status: 'DONE', totalAmount: 1 } })
        expect(res.status).toBe(200)
        expect(h.getPayment).toHaveBeenCalledWith('pk')
        expect(h.updates[0]).toMatchObject({ status: 'canceled' })
        expect(h.slack).toHaveBeenCalledWith(expect.stringContaining('9,900원'), expect.anything(), { timeoutMs: 3000 })
    })

    it('모르는·진행 중 상태(IN_PROGRESS·WAITING_FOR_DEPOSIT·READY)는 200 + DB 갱신 없음(실패로 적지 않는다)', async () => {
        for (const status of ['IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'READY', 'SOMETHING_NEW']) {
            h.updates.length = 0
            h.getPayment.mockResolvedValue({ paymentKey: 'pk', orderId: 'o', status, totalAmount: 9900 })
            const res = await post({ eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'pk' } })
            expect(res.status, status).toBe(200)
            expect(h.updates, status).toHaveLength(0)
        }
    })

    it('부분 취소(PARTIAL_CANCELED)는 전체 취소로 바꾸지 않는다(결제 기록 상태 그대로) + 알림', async () => {
        h.getPayment.mockResolvedValue({ paymentKey: 'pk', orderId: 'o', status: 'PARTIAL_CANCELED', totalAmount: 9900 })
        const res = await post({ eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'pk' } })
        expect(res.status).toBe(200)
        expect(h.updates.some(u => u.status === 'canceled')).toBe(false)
        expect(h.slack).toHaveBeenCalledTimes(1)
    })

    it('토스에 없는 결제(404)면 꾸민 요청 → DB·슬랙 손대지 않고 400', async () => {
        h.getPayment.mockRejectedValue(Object.assign(new Error('없음'), { status: 404 }))
        const res = await post({ eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'fake', status: 'DONE' } })
        expect(res.status).toBe(400)
        expect(h.updates).toHaveLength(0)
        expect(h.slack).not.toHaveBeenCalled()
    })

    it('처리 중 오류(토스 조회 장애·DB 실패)는 500 → 토스가 다시 보낸다', async () => {
        h.getPayment.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
        expect((await post({ eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'pk' } })).status).toBe(500)
        h.getPayment.mockResolvedValue({ paymentKey: 'pk', orderId: 'o', status: 'DONE', totalAmount: 1 })
        h.updateError = { message: 'db down' }
        expect((await post({ eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'pk' } })).status).toBe(500)
        expect(h.alert).toHaveBeenCalled()
    })

    it('서명 머리글이 붙어 왔는데 틀리면 401', async () => {
        const res = await post({ eventType: 'payout.changed', data: {} }, { 'tosspayments-webhook-signature': 'v1:AAAA', 'tosspayments-webhook-transmission-time': 't' })
        expect(res.status).toBe(401)
        expect(h.slack).not.toHaveBeenCalled()
    })

    it('서명이 맞는 기타 이벤트는 슬랙에 알린다', async () => {
        const raw = JSON.stringify({ eventType: 'payout.changed', data: { a: 1 } })
        const sig = `v1:${createHmac('sha256', 'whk').update(`${raw}:t1`).digest('base64')}`
        const res = await post(raw, { 'tosspayments-webhook-signature': sig, 'tosspayments-webhook-transmission-time': 't1' })
        expect(res.status).toBe(200)
        expect(h.slack).toHaveBeenCalledTimes(1)
    })

    it('서명도 없고 확인할 길도 없는 기타 이벤트는 슬랙에 올리지 않는다(도배 막기)', async () => {
        const res = await post({ eventType: 'SOMETHING', data: { spam: 'x' } })
        expect(res.status).toBe(200)
        expect(h.slack).not.toHaveBeenCalled()
    })
})
