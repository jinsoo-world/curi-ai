import { describe, it, expect, vi } from 'vitest'
import { runRenewals, type RenewDeps, type ChargeResult } from '../renew'
import type { Subscription } from '../types'

const NOW = new Date('2026-10-06T00:00:00Z')
const SID = '11111111-1111-4111-8111-111111111111'

const sub = (over: Partial<Subscription> = {}): Subscription => ({
    id: SID, user_id: 'u1', plan_type: 'monthly', status: 'active', billing_key: 'bk', customer_key: 'ck',
    current_period_start: '2026-09-06T00:00:00Z', current_period_end: '2026-10-05T15:00:00Z',
    canceled_at: null, created_at: '', updated_at: '2026-10-05T00:00:00Z', ...over,
})

const paid: ChargeResult = { paymentKey: 'pk', orderId: `renew-${SID}-2026-10-05`, totalAmount: 9900, approvedAt: NOW.toISOString() }

function deps(subs: Subscription[], over: Partial<RenewDeps> = {}) {
    const d: RenewDeps & { calls: string[] } = {
        calls: [],
        listDue: async () => subs,
        claim: vi.fn(async () => true),
        expire: vi.fn(async () => {}),
        charge: vi.fn(async () => paid),
        lookupOrder: vi.fn(async () => null),
        markRenewed: vi.fn(async () => {}),
        markPastDue: vi.fn(async () => {}),
        markPaidUnsynced: vi.fn(async () => {}),
        alert: vi.fn(async () => {}),
        ...over,
    }
    return d
}

describe('자동결제 갱신 runRenewals', () => {
    it('정해진 주문번호 renew-{구독번호}-{기간 끝 날짜}로 결제하고 갱신한다', async () => {
        const d = deps([sub()])
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.charge).toHaveBeenCalledWith(expect.anything(), expect.any(Number), `renew-${SID}-2026-10-05`, expect.stringContaining('갱신'))
        expect(d.markRenewed).toHaveBeenCalledTimes(1)
        expect(r).toMatchObject({ renewed: 1, failed: 0 })
    })

    it('먼저 잡지 못하면(다른 실행이 잡음) 결제하지 않는다', async () => {
        const d = deps([sub()], { claim: vi.fn(async () => false) })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.charge).not.toHaveBeenCalled()
        expect(r.skipped).toBe(1)
    })

    it('결제는 됐는데 DB 반영이 실패하면 past_due 가 아니라 renew_paid_unsynced + 알림', async () => {
        const d = deps([sub()], { markRenewed: vi.fn(async () => { throw new Error('db down') }) })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.markPaidUnsynced).toHaveBeenCalledTimes(1)
        expect(d.markPastDue).not.toHaveBeenCalled()
        expect(d.alert).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ paymentKey: 'pk' }) }))
        expect(r.unsynced).toBe(1)
    })

    it('카드 거절이고 그 주문번호로 결제된 것도 없으면 past_due + 알림', async () => {
        const d = deps([sub()], { charge: vi.fn(async () => { throw new Error('카드 한도 초과') }) })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.markPastDue).toHaveBeenCalledTimes(1)
        expect(r.failed).toBe(1)
    })

    it('결제 오류가 났지만 같은 주문번호가 이미 DONE 이면 다시 결제하지 않고 DB 만 맞춘다', async () => {
        const d = deps([sub()], {
            charge: vi.fn(async () => { throw Object.assign(new Error('이미 처리된 결제'), { code: 'ALREADY_PROCESSED_PAYMENT' }) }),
            lookupOrder: vi.fn(async () => ({ paymentKey: 'pk0', orderId: paid.orderId, status: 'DONE', totalAmount: 9900 })),
        })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.markPastDue).not.toHaveBeenCalled()
        expect(d.markRenewed).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ paymentKey: 'pk0' }))
        expect(r.synced).toBe(1)
    })

    it('결제 중 죽어 renewing 으로 남은 줄은 먼저 주문번호로 확인 → 이미 결제됐으면 결제 없이 갱신', async () => {
        const d = deps([sub({ status: 'renewing' })], {
            lookupOrder: vi.fn(async () => ({ paymentKey: 'pk0', orderId: paid.orderId, status: 'DONE' })),
        })
        await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.charge).not.toHaveBeenCalled()
        expect(d.markRenewed).toHaveBeenCalledTimes(1)
    })

    it('결제 응답도 조회도 안 되면(결제 여부 모름) past_due 로 적지 않고 renewing 으로 둔다', async () => {
        const d = deps([sub()], {
            charge: vi.fn(async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) }),
            lookupOrder: vi.fn(async () => { throw new Error('network') }),
        })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.markPastDue).not.toHaveBeenCalled()
        expect(d.markRenewed).not.toHaveBeenCalled()
        expect(r.uncertain).toBe(1)
    })

    it('남은 시간이 모자라면 새 구독을 시작하지 않는다', async () => {
        const d = deps([sub(), sub({ id: 'x' })])
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 1_000 })
        expect(d.charge).not.toHaveBeenCalled()
        expect(r.skippedForTime).toBe(2)
    })

    it('한 구독의 예기치 못한 오류가 다음 구독을 막지 않는다', async () => {
        let n = 0
        const d = deps([sub({ id: 'a' }), sub({ id: 'b' })], { claim: vi.fn(async () => { if (n++ === 0) throw new Error('boom'); return true }) })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(r).toMatchObject({ failed: 1, renewed: 1 })
    })
})
