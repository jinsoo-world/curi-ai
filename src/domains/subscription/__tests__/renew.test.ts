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
        markCanceled: vi.fn(async () => {}),
        markNeedsReview: vi.fn(async () => {}),
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
        const d = deps([sub()], { charge: vi.fn(async () => { throw Object.assign(new Error('카드 한도 초과'), { code: 'EXCEED_MAX_AMOUNT' }) }) })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.markPastDue).toHaveBeenCalledTimes(1)
        expect(r.failed).toBe(1)
    })

    it('토스가 코드로 거절했고 조회가 ABORTED/EXPIRED 여도 past_due', async () => {
        for (const status of ['ABORTED', 'EXPIRED']) {
            const d = deps([sub()], {
                charge: vi.fn(async () => { throw Object.assign(new Error('거절'), { code: 'REJECT_CARD_COMPANY' }) }),
                lookupOrder: vi.fn(async () => ({ paymentKey: 'pk', orderId: paid.orderId, status })),
            })
            await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
            expect(d.markPastDue, status).toHaveBeenCalledTimes(1)
        }
    })

    it('토스 10초 시간 초과(코드 없음) 후 조회가 null 이어도 past_due 로 적지 않는다 = renewing 유지', async () => {
        const d = deps([sub()], {
            charge: vi.fn(async () => { throw Object.assign(new Error('This operation was aborted'), { name: 'TimeoutError' }) }),
            lookupOrder: vi.fn(async () => null),
        })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.markPastDue).not.toHaveBeenCalled()
        expect(r.uncertain).toBe(1)
    })

    it('네트워크 오류(코드 없음)도 renewing 유지', async () => {
        const d = deps([sub()], { charge: vi.fn(async () => { throw new TypeError('fetch failed') }) })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.markPastDue).not.toHaveBeenCalled()
        expect(r.uncertain).toBe(1)
    })

    it('코드로 거절됐어도 조회가 IN_PROGRESS 면 확실하지 않다 = renewing 유지', async () => {
        const d = deps([sub()], {
            charge: vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'PROVIDER_ERROR' }) }),
            lookupOrder: vi.fn(async () => ({ paymentKey: 'pk', orderId: paid.orderId, status: 'IN_PROGRESS' })),
        })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.markPastDue).not.toHaveBeenCalled()
        expect(r.uncertain).toBe(1)
    })

    it('자동 갱신할 수 없는 요금제는 결제 없이 확실한 실패(past_due)', async () => {
        const d = deps([sub({ plan_type: 'pro' })])
        await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.charge).not.toHaveBeenCalled()
        expect(d.markPastDue).toHaveBeenCalledTimes(1)
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

    it('결제 중 죽은 renewing 을 다시 잡았는데 주문번호 조회가 오류면 다시 결제하지 않는다(확인 불가)', async () => {
        const d = deps([sub({ status: 'renewing' })], { lookupOrder: vi.fn(async () => { throw new Error('network') }) })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.charge).not.toHaveBeenCalled()
        expect(r.uncertain).toBe(1)
    })

    it('해지 신청이 들어온 줄은 결제하지 않는다 — 조회해서 이미 결제됐으면 기간 연장(해지 유지), 아니면 해지로', async () => {
        const done = deps([sub({ status: 'renewing', cancel_requested_at: '2026-10-05T16:00:00Z' })], {
            lookupOrder: vi.fn(async () => ({ paymentKey: 'pk0', orderId: paid.orderId, status: 'DONE' })),
        })
        await runRenewals(done, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(done.charge).not.toHaveBeenCalled()
        expect(done.markRenewed).toHaveBeenCalledTimes(1)

        const none = deps([sub({ status: 'renewing', cancel_requested_at: '2026-10-05T16:00:00Z' })])
        await runRenewals(none, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(none.charge).not.toHaveBeenCalled()
        expect(none.markCanceled).toHaveBeenCalledTimes(1)
    })

    it('해지 신청 줄이 조회 진행 중(IN_PROGRESS)·오류면 그대로 둔다(결제도 해지도 안 함)', async () => {
        const d = deps([sub({ status: 'renewing', cancel_requested_at: '2026-10-05T16:00:00Z' })], {
            lookupOrder: vi.fn(async () => ({ paymentKey: 'pk0', orderId: paid.orderId, status: 'IN_PROGRESS' })),
        })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.charge).not.toHaveBeenCalled()
        expect(d.markCanceled).not.toHaveBeenCalled()
        expect(r.uncertain).toBe(1)
    })

    it('renewing 이 3일 넘게 안 풀리면 결제 시도를 멈추고 사람 확인으로 + 알림 한 번(건수만)', async () => {
        const old = (id: string) => sub({ id, status: 'renewing', current_period_end: '2026-10-01T15:00:00Z' })
        const d = deps([old('a'), old('b')], { lookupOrder: vi.fn(async () => ({ paymentKey: 'p', orderId: 'o', status: 'IN_PROGRESS' })) })
        const r = await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.charge).not.toHaveBeenCalled()
        expect(d.markNeedsReview).toHaveBeenCalledTimes(2)
        expect(r.needsReview).toBe(2)
        const reviewAlerts = (d.alert as ReturnType<typeof vi.fn>).mock.calls.filter(c => String(c[0].source).includes('사람 확인'))
        expect(reviewAlerts).toHaveLength(1)
        expect(String(reviewAlerts[0][0].error)).toContain('2건')
        expect(JSON.stringify(reviewAlerts[0][0])).not.toContain('"a"')
    })

    it('3일 넘은 renewing 이라도 조회가 DONE 이면 갱신으로 맞춘다', async () => {
        const d = deps([sub({ status: 'renewing', current_period_end: '2026-10-01T15:00:00Z' })], {
            lookupOrder: vi.fn(async () => ({ paymentKey: 'p', orderId: 'o', status: 'DONE' })),
        })
        await runRenewals(d, { now: () => NOW, deadline: Date.now() + 60_000 })
        expect(d.markRenewed).toHaveBeenCalledTimes(1)
        expect(d.markNeedsReview).not.toHaveBeenCalled()
    })
})
