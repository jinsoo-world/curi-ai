import { describe, it, expect } from 'vitest'
import { handleRevenueCatWebhook, type RcStore } from '../revenuecat-service'
import type { PlanRowFull, RcEvent } from '../revenuecat'
import type { UserPlanWrite } from '../revenuecat'

const NOW = new Date('2026-10-02T00:00:00Z')
const NOW_MS = NOW.getTime()
const DAY = 86_400_000
const U = '11111111-1111-4111-8111-111111111111'
const V = '33333333-3333-4333-8333-333333333333'
const AUTH = 'Bearer rc-webhook-secret'

function memStore(users: string[] = [U, V]) {
    const plans = new Map<string, PlanRowFull>()
    const events = new Map<string, { outcome: string; user_id: string | null }>()
    let fail = false
    const store: RcStore = {
        async userExists(id) { return users.includes(id) },
        async getPlanRow(id) { return plans.get(id) ?? null },
        async savePlan(w: UserPlanWrite) {
            if (fail) throw new Error('db down')
            plans.set(w.user_id, { plan: w.plan, expires_at: w.expires_at, last_order_id: w.last_order_id })
        },
        async hasEvent(id) { return events.has(id) },
        async saveEvent(e) { events.set(e.id, { outcome: e.outcome, user_id: e.user_id }) },
    }
    return { store, plans, events, breakDb: () => { fail = true } }
}

function ev(over: Partial<RcEvent> = {}): RcEvent {
    return {
        id: 'evt-1', type: 'INITIAL_PURCHASE', app_user_id: U, original_app_user_id: U, aliases: [U],
        product_id: 'com.missiondriven.curiai.basic.monthly', entitlement_ids: ['basic'],
        purchased_at_ms: NOW_MS, expiration_at_ms: NOW_MS + 31 * DAY, event_timestamp_ms: NOW_MS,
        environment: 'PRODUCTION', store: 'APP_STORE', ...over,
    }
}

const run = (store: RcStore, body: unknown, authHeader: string | null = AUTH, secret: string | undefined = AUTH) =>
    handleRevenueCatWebhook({ authHeader, body, secret, store, now: NOW })

describe('POST /api/billing/revenuecat/webhook 속', () => {
    it('열쇠가 틀리면 401, 아무것도 바꾸지 않는다', async () => {
        const { store, plans, events } = memStore()
        expect((await run(store, { event: ev() }, 'Bearer wrong')).status).toBe(401)
        expect((await run(store, { event: ev() }, null)).status).toBe(401)
        expect(plans.size + events.size).toBe(0)
    })

    it('서버에 열쇠가 설정돼 있지 않으면 503 (레비뉴캣이 나중에 다시 보낸다)', async () => {
        const { store } = memStore()
        expect((await run(store, { event: ev() }, AUTH, '')).status).toBe(503)
    })

    it('몸통이 틀리면 400', async () => {
        const { store } = memStore()
        for (const body of [null, {}, { event: {} }, { event: { id: 'x' } }]) {
            expect((await run(store, body)).status).toBe(400)
        }
    })

    it('INITIAL_PURCHASE → 베이직 열림, 같은 알림이 또 오면 duplicate 로 한 번만', async () => {
        const { store, plans, events } = memStore()
        const a = await run(store, { api_version: '1.0', event: ev() })
        expect(a).toMatchObject({ status: 200, body: { ok: true, outcome: 'set' } })
        expect(plans.get(U)).toMatchObject({ plan: 'basic', expires_at: new Date(NOW_MS + 31 * DAY).toISOString() })
        expect(events.get('evt-1')).toMatchObject({ outcome: 'set', user_id: U })

        plans.set(U, { ...plans.get(U)!, expires_at: new Date(NOW_MS + 99 * DAY).toISOString() }) // 그 사이 다른 변화
        const b = await run(store, { api_version: '1.0', event: ev() })
        expect(b).toMatchObject({ status: 200, body: { ok: true, outcome: 'duplicate' } })
        expect(plans.get(U)!.expires_at).toBe(new Date(NOW_MS + 99 * DAY).toISOString())
    })

    it('RENEWAL → 끝나는 날 연장', async () => {
        const { store, plans } = memStore()
        await run(store, { event: ev() })
        await run(store, { event: ev({ id: 'evt-2', type: 'RENEWAL', expiration_at_ms: NOW_MS + 62 * DAY }) })
        expect(plans.get(U)!.expires_at).toBe(new Date(NOW_MS + 62 * DAY).toISOString())
    })

    it('CANCELLATION(자동 갱신 끔) → 그대로, UNCANCELLATION → 그대로', async () => {
        const { store, plans } = memStore()
        await run(store, { event: ev() })
        const before = { ...plans.get(U)! }
        await run(store, { event: ev({ id: 'evt-3', type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' }) })
        await run(store, { event: ev({ id: 'evt-4', type: 'UNCANCELLATION' }) })
        expect(plans.get(U)).toMatchObject({ plan: before.plan, expires_at: before.expires_at })
    })

    it('EXPIRATION → 무료', async () => {
        const { store, plans } = memStore()
        await run(store, { event: ev({ expiration_at_ms: NOW_MS + 1000 }) })
        const r = await run(store, { event: ev({ id: 'evt-5', type: 'EXPIRATION', expiration_at_ms: NOW_MS + 1000 }) })
        expect(r.body).toMatchObject({ outcome: 'set' })
        expect(plans.get(U)).toMatchObject({ plan: 'free', expires_at: null })
    })

    it('BILLING_ISSUE → 끝나는 날까지는 그대로', async () => {
        const { store, plans } = memStore()
        await run(store, { event: ev() })
        const r = await run(store, { event: ev({ id: 'evt-6', type: 'BILLING_ISSUE' }) })
        expect(r.body).toMatchObject({ outcome: 'ignored' })
        expect(plans.get(U)?.plan).toBe('basic')
    })

    it('PRODUCT_CHANGE → 기록만, 다음 RENEWAL(pro)에서 프로로', async () => {
        const { store, plans, events } = memStore()
        await run(store, { event: ev() })
        await run(store, { event: ev({ id: 'evt-7', type: 'PRODUCT_CHANGE', new_product_id: 'com.missiondriven.curiai.pro.monthly' }) })
        expect(plans.get(U)?.plan).toBe('basic')
        expect(events.has('evt-7')).toBe(true)
        await run(store, { event: ev({ id: 'evt-8', type: 'RENEWAL', entitlement_ids: ['pro'], product_id: 'com.missiondriven.curiai.pro.monthly', expiration_at_ms: NOW_MS + 62 * DAY }) })
        expect(plans.get(U)?.plan).toBe('pro')
    })

    it('TRANSFER → 넘겨준 사람의 앱 요금제는 닫는다 (받은 사람은 다음 갱신 때 열린다)', async () => {
        const { store, plans } = memStore()
        await run(store, { event: ev() })
        const r = await run(store, { event: { id: 'evt-9', type: 'TRANSFER', transferred_from: [U], transferred_to: [V], event_timestamp_ms: NOW_MS, environment: 'PRODUCTION' } })
        expect(r.status).toBe(200)
        expect(plans.get(U)).toMatchObject({ plan: 'free' })
        expect(plans.has(V)).toBe(false)
    })

    it('SUBSCRIBER_ALIAS·TEST → 200 무시', async () => {
        const { store } = memStore()
        expect((await run(store, { event: ev({ id: 'e-a', type: 'SUBSCRIBER_ALIAS' }) })).body).toMatchObject({ outcome: 'ignored' })
        expect((await run(store, { event: ev({ id: 'e-t', type: 'TEST', app_user_id: 'test', original_app_user_id: 'test', aliases: [] }) })).body).toMatchObject({ outcome: 'ignored' })
    })

    it('모르는 회원이면 200 unknown_user 로 기록만 (계속 다시 보내지 않게)', async () => {
        const { store, plans, events } = memStore([])
        const r = await run(store, { event: ev() })
        expect(r).toMatchObject({ status: 200, body: { outcome: 'unknown_user' } })
        expect(plans.size).toBe(0)
        expect(events.get('evt-1')?.outcome).toBe('unknown_user')

        const { store: s2 } = memStore()
        const anon = await run(s2, { event: ev({ id: 'evt-anon', app_user_id: '$RCAnonymousID:x', original_app_user_id: '$RCAnonymousID:x', aliases: [] }) })
        expect(anon.body).toMatchObject({ outcome: 'unknown_user' })
    })

    it('저장이 실패하면 500 이고 기록도 안 남겨, 다시 보내면 처리된다', async () => {
        const m = memStore()
        m.breakDb()
        expect((await run(m.store, { event: ev() })).status).toBe(500)
        expect(m.events.has('evt-1')).toBe(false)
    })
})
