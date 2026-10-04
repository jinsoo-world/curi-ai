import { describe, it, expect, vi } from 'vitest'
import { handleRevenueCatWebhook, type RcStore } from '../revenuecat-service'
import type { PlanRowFull, RcEvent } from '../revenuecat'

const NOW = new Date('2026-10-05T00:00:00Z')
const DAY = 86_400_000
const U = '11111111-1111-4111-8111-111111111111'
const AUTH = 'Bearer s'

function store(markFirstPaid?: RcStore['markFirstPaid'], breakMark = false) {
    const plans = new Map<string, PlanRowFull>()
    const s: RcStore = {
        async userExists() { return true },
        async getPlanRow(id) { return plans.get(id) ?? null },
        async savePlan(w) { plans.set(w.user_id, { plan: w.plan, expires_at: w.expires_at, last_order_id: w.last_order_id, rc_event_ms: w.rc_event_ms ?? null, rc_transaction_id: null }); return true },
        async claimEvent() { return 'claimed' },
        async finishEvent() {},
        async releaseEvent() {},
        markFirstPaid: breakMark ? async () => { throw new Error('x') } : markFirstPaid,
    }
    return s
}
const ev = (o: Partial<RcEvent> = {}): RcEvent => ({
    id: 'e1', type: 'INITIAL_PURCHASE', app_user_id: U, original_app_user_id: U, aliases: [U], product_id: 'com.missiondriven.curiai.basic.monthly',
    entitlement_ids: ['basic'], transaction_id: 't1', purchased_at_ms: NOW.getTime(), expiration_at_ms: NOW.getTime() + 31 * DAY, event_timestamp_ms: NOW.getTime(),
    environment: 'PRODUCTION', store: 'APP_STORE', ...o,
})
const run = (s: RcStore, e: RcEvent) => handleRevenueCatWebhook({ authHeader: AUTH, body: { event: e }, secret: AUTH, store: s, now: NOW })

describe('앱 구독 처음 결제 기록 (광고비 판단용)', () => {
    it('진짜 결제로 요금제가 열리면 처음 결제를 남긴다', async () => {
        const mark = vi.fn(async () => true)
        const r = await run(store(mark), ev())
        expect(r.body.outcome).toBe('set')
        expect(mark).toHaveBeenCalledWith(U, NOW)
    })
    it('샌드박스 결제는 남기지 않는다', async () => {
        const mark = vi.fn(async () => true)
        const s = store(mark)
        const r = await handleRevenueCatWebhook({ authHeader: AUTH, body: { event: ev({ environment: 'SANDBOX' }) }, secret: AUTH, store: s, now: NOW, allowSandbox: true })
        expect(r.body.outcome).toBe('set')
        expect(mark).not.toHaveBeenCalled()
    })
    it('남기다 실패해도 알림 처리는 정상', async () => {
        const r = await run(store(undefined, true), ev())
        expect(r.status).toBe(200)
        expect(r.body.outcome).toBe('set')
    })
})
