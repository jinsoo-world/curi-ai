// 갱신 중 해지가 덮어써지지 않게 / 갱신 중에는 해지를 막는다
import { describe, it, expect } from 'vitest'
import { renewSubscription, cancelSubscription, requestCancelDuringRenew } from '../actions'

/** update 를 부를 때마다 결과를 차례로 돌려주는 가짜 DB. 걸린 조건을 기록한다 */
function fakeDb(results: { data: unknown[] | null; error: null | { message: string } }[]) {
    const calls: { patch: Record<string, unknown>; filters: unknown[][] }[] = []
    let i = 0
    const db = {
        from: () => {
            const call = { patch: {} as Record<string, unknown>, filters: [] as unknown[][] }
            const q: Record<string, unknown> = {}
            q.update = (p: Record<string, unknown>) => { call.patch = p; calls.push(call); return q }
            q.eq = (...a: unknown[]) => { call.filters.push(['eq', ...a]); return q }
            q.in = (...a: unknown[]) => { call.filters.push(['in', ...a]); return q }
            q.is = (...a: unknown[]) => { call.filters.push(['is', ...a]); return q }
            q.select = () => q
            q.then = (res: (v: unknown) => unknown) => Promise.resolve(results[i++] ?? { data: [], error: null }).then(res)
            return q
        },
    }
    return { db: db as never, calls }
}

describe('renewSubscription — 갱신 중(renewing·renew_paid_unsynced)이고 해지 신청이 없을 때만 active', () => {
    it('갱신 중 + 해지 신청 없음이면 기간 연장 + active (한 번에)', async () => {
        const { db, calls } = fakeDb([{ data: [{ id: 's' }], error: null }])
        const r = await renewSubscription(db, 's', 'monthly')
        expect(r).toEqual({ status: 'active' })
        expect(calls[0].patch.status).toBe('active')
        expect(calls[0].filters).toContainEqual(['in', 'status', ['renewing', 'renew_paid_unsynced']])
        expect(calls[0].filters).toContainEqual(['is', 'cancel_requested_at', null])
        expect(calls).toHaveLength(1)
    })
    it('해지 신청이 들어와 있으면 기간은 연장하고 canceled (돈은 냈다, 해지는 지킨다)', async () => {
        const { db, calls } = fakeDb([
            { data: [], error: null },
            { data: [{ id: 's', status: 'canceled' }], error: null },
        ])
        const r = await renewSubscription(db, 's', 'monthly')
        expect(r).toEqual({ status: 'canceled' })
        expect(calls[1].patch).toMatchObject({ status: 'canceled' })
        expect(calls[1].patch).toHaveProperty('current_period_end')
        expect(calls[1].filters).toContainEqual(['in', 'status', ['renewing', 'renew_paid_unsynced']])
    })
    it('그 밖에 상태가 바뀌었으면(이미 해지 등) 상태는 그대로 두고 기간만 연장', async () => {
        const { db, calls } = fakeDb([
            { data: [], error: null },
            { data: [], error: null },
            { data: [{ id: 's', status: 'canceled' }], error: null },
        ])
        const r = await renewSubscription(db, 's', 'monthly')
        expect(r).toEqual({ status: 'canceled' })
        expect(calls[2].patch).not.toHaveProperty('status')
        expect(calls[2].patch).toHaveProperty('current_period_end')
    })
    it('DB 오류면 던진다(부른 쪽이 renew_paid_unsynced 로 적는다)', async () => {
        const { db } = fakeDb([{ data: null, error: { message: 'down' } }])
        await expect(renewSubscription(db, 's', 'monthly')).rejects.toThrow('down')
    })
})

describe('requestCancelDuringRenew — 갱신 처리 중 해지 신청', () => {
    it('renewing·renew_paid_unsynced·renew_needs_review 줄에 cancel_requested_at 을 찍는다', async () => {
        const { db, calls } = fakeDb([{ data: [{ id: 's' }], error: null }])
        expect(await requestCancelDuringRenew(db, 's')).toBe(true)
        expect(calls[0].patch).toHaveProperty('cancel_requested_at')
        expect(calls[0].filters).toContainEqual(['in', 'status', ['renewing', 'renew_paid_unsynced', 'renew_needs_review']])
    })
    it('그새 상태가 바뀌어 0줄이면 false', async () => {
        const { db } = fakeDb([{ data: [], error: null }])
        expect(await requestCancelDuringRenew(db, 's')).toBe(false)
    })
})

describe('cancelSubscription — active 일 때만 해지', () => {
    it('active 줄만 canceled 로 바꾸고 true', async () => {
        const { db, calls } = fakeDb([{ data: [{ id: 's' }], error: null }])
        expect(await cancelSubscription(db, 's')).toBe(true)
        expect(calls[0].filters).toContainEqual(['in', 'status', ['active']])
    })
    it('갱신 중(renewing)이라 0줄이면 false = 해지하지 않는다', async () => {
        const { db } = fakeDb([{ data: [], error: null }])
        expect(await cancelSubscription(db, 's')).toBe(false)
    })
})
