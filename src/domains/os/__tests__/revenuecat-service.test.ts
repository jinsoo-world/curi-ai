import { describe, it, expect, vi } from 'vitest'
import { handleRevenueCatWebhook, type RcStore, type RcEventRecord } from '../revenuecat-service'
import type { PlanRowFull, RcEvent, UserPlanWrite } from '../revenuecat'

const NOW = new Date('2026-10-02T00:00:00Z')
const NOW_MS = NOW.getTime()
const DAY = 86_400_000
const U = '11111111-1111-4111-8111-111111111111'
const V = '33333333-3333-4333-8333-333333333333'
const AUTH = 'Bearer rc-webhook-secret'

/** DB 와 같은 규칙의 메모리 저장소: 알림은 먼저 잡고(claim), 요금제 쓰기는 더 새 알림일 때만 */
function memStore(users: string[] = [U, V]) {
    const plans = new Map<string, PlanRowFull>()
    const events = new Map<string, RcEventRecord>()
    let fail = false
    const store: RcStore = {
        async userExists(id) { return users.includes(id) },
        async getPlanRow(id) { return plans.get(id) ?? null },
        async savePlan(w: UserPlanWrite) {
            if (fail) throw new Error('db down')
            const cur = plans.get(w.user_id)
            if (cur && cur.rc_event_ms != null && w.rc_event_ms != null && cur.rc_event_ms > w.rc_event_ms) return false
            plans.set(w.user_id, { plan: w.plan, expires_at: w.expires_at, last_order_id: w.last_order_id, rc_event_ms: w.rc_event_ms ?? null, rc_transaction_id: w.rc_transaction_id ?? null })
            return true
        },
        async claimEvent(e) {
            if (events.has(e.id)) return false
            events.set(e.id, e)
            return true
        },
        async finishEvent(id, patch) { events.set(id, { ...events.get(id)!, ...patch }) },
        async releaseEvent(id) { events.delete(id) },
    }
    return { store, plans, events, breakDb: () => { fail = true } }
}

function ev(over: Partial<RcEvent> = {}): RcEvent {
    return {
        id: 'evt-1', type: 'INITIAL_PURCHASE', app_user_id: U, original_app_user_id: U, aliases: [U],
        product_id: 'com.missiondriven.curiai.basic.monthly', entitlement_ids: ['basic'], transaction_id: 'tx-1',
        purchased_at_ms: NOW_MS, expiration_at_ms: NOW_MS + 31 * DAY, event_timestamp_ms: NOW_MS,
        environment: 'PRODUCTION', store: 'APP_STORE', ...over,
    }
}

const run = (store: RcStore, body: unknown, o: { authHeader?: string | null; secret?: string; allowSandbox?: boolean; syncUser?: (id: string) => Promise<unknown> } = {}) =>
    handleRevenueCatWebhook({
        authHeader: 'authHeader' in o ? o.authHeader! : AUTH, body, secret: 'secret' in o ? o.secret : AUTH,
        store, now: NOW, allowSandbox: o.allowSandbox ?? false, syncUser: o.syncUser,
    })

describe('POST /api/billing/revenuecat/webhook 속', () => {
    it('열쇠가 틀리면 401, 아무것도 바꾸지 않는다', async () => {
        const { store, plans, events } = memStore()
        expect((await run(store, { event: ev() }, { authHeader: 'Bearer wrong' })).status).toBe(401)
        expect((await run(store, { event: ev() }, { authHeader: null })).status).toBe(401)
        expect(plans.size + events.size).toBe(0)
    })

    it('서버에 열쇠가 설정돼 있지 않으면 503 (레비뉴캣이 나중에 다시 보낸다)', async () => {
        const { store } = memStore()
        expect((await run(store, { event: ev() }, { secret: '' })).status).toBe(503)
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
        expect(plans.get(U)).toMatchObject({ plan: 'basic', expires_at: new Date(NOW_MS + 31 * DAY).toISOString(), rc_transaction_id: 'tx-1' })
        expect(events.get('evt-1')).toMatchObject({ outcome: 'set', user_id: U })

        plans.set(U, { ...plans.get(U)!, expires_at: new Date(NOW_MS + 99 * DAY).toISOString() })
        const b = await run(store, { api_version: '1.0', event: ev() })
        expect(b).toMatchObject({ status: 200, body: { ok: true, outcome: 'duplicate' } })
        expect(plans.get(U)!.expires_at).toBe(new Date(NOW_MS + 99 * DAY).toISOString())
    })

    it('저장하는 알림 내용에 이메일·속성·회원번호를 넣지 않는다', async () => {
        const { store, events } = memStore()
        await run(store, { event: { ...ev(), subscriber_attributes: { $email: { value: 'a@b.c', updated_at_ms: 1 } } } })
        const saved = JSON.stringify(events.get('evt-1')!.payload)
        expect(saved).not.toContain('a@b.c')
        expect(saved).not.toContain('subscriber_attributes')
        expect(saved).not.toContain(U)
        expect(events.get('evt-1')!.app_user_id).toBe(U)
    })

    it('RENEWAL → 끝나는 날 연장', async () => {
        const { store, plans } = memStore()
        await run(store, { event: ev() })
        await run(store, { event: ev({ id: 'evt-2', type: 'RENEWAL', transaction_id: 'tx-2', expiration_at_ms: NOW_MS + 62 * DAY, event_timestamp_ms: NOW_MS + 1 }) })
        expect(plans.get(U)).toMatchObject({ expires_at: new Date(NOW_MS + 62 * DAY).toISOString(), rc_transaction_id: 'tx-2' })
    })

    it('갱신 뒤 늦게 온 옛 환불·결제 문제는 요금제를 지우지 않는다 (알림 시각 비교)', async () => {
        const { store, plans } = memStore()
        await run(store, { event: ev({ event_timestamp_ms: NOW_MS - 10 * DAY }) })
        await run(store, { event: ev({ id: 'evt-2', type: 'RENEWAL', transaction_id: 'tx-2', expiration_at_ms: NOW_MS + 62 * DAY }) })
        const late1 = await run(store, { event: ev({ id: 'evt-3', type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', transaction_id: 'tx-2', event_timestamp_ms: NOW_MS - 5 * DAY }) })
        const late2 = await run(store, { event: ev({ id: 'evt-4', type: 'BILLING_ISSUE', expiration_at_ms: NOW_MS - DAY, event_timestamp_ms: NOW_MS - 4 * DAY }) })
        expect(late1.body).toMatchObject({ outcome: 'ignored', reason: 'stale_event' })
        expect(late2.body).toMatchObject({ outcome: 'ignored', reason: 'stale_event' })
        expect(plans.get(U)?.plan).toBe('basic')
    })

    it('지난 기간 거래의 환불은 지금 요금제를 두고, 지금 기간 거래의 환불은 무료로', async () => {
        const { store, plans } = memStore()
        await run(store, { event: ev() })
        await run(store, { event: ev({ id: 'evt-2', type: 'RENEWAL', transaction_id: 'tx-2', expiration_at_ms: NOW_MS + 62 * DAY, event_timestamp_ms: NOW_MS + 1 }) })
        await run(store, { event: ev({ id: 'evt-3', type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', transaction_id: 'tx-1', event_timestamp_ms: NOW_MS + 2 }) })
        expect(plans.get(U)?.plan).toBe('basic')
        await run(store, { event: ev({ id: 'evt-4', type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', transaction_id: 'tx-2', event_timestamp_ms: NOW_MS + 3 }) })
        expect(plans.get(U)?.plan).toBe('free')
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
        const r = await run(store, { event: ev({ id: 'evt-5', type: 'EXPIRATION', expiration_at_ms: NOW_MS + 1000, event_timestamp_ms: NOW_MS + 1 }) })
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
        await run(store, { event: ev({ id: 'evt-8', type: 'RENEWAL', entitlement_ids: ['pro'], product_id: 'com.missiondriven.curiai.pro.monthly', expiration_at_ms: NOW_MS + 62 * DAY, event_timestamp_ms: NOW_MS + 1 }) })
        expect(plans.get(U)?.plan).toBe('pro')
    })

    it('TRANSFER → 넘겨준 사람은 닫고, 받은 사람은 레비뉴캣에 물어 맞춘다', async () => {
        const { store, plans } = memStore()
        await run(store, { event: ev() })
        const syncUser = vi.fn(async () => 'set')
        const r = await run(store, { event: { id: 'evt-9', type: 'TRANSFER', transferred_from: [U], transferred_to: [V, '$RCAnonymousID:x'], event_timestamp_ms: NOW_MS + 1, environment: 'PRODUCTION' } }, { syncUser })
        expect(r.status).toBe(200)
        expect(plans.get(U)).toMatchObject({ plan: 'free' })
        expect(syncUser).toHaveBeenCalledTimes(1)
        expect(syncUser).toHaveBeenCalledWith(V)
    })

    it('샌드박스 알림은 기록만 하고 무시, REVENUECAT_ALLOW_SANDBOX=1 이면 반영', async () => {
        const a = memStore()
        const r = await run(a.store, { event: ev({ environment: 'SANDBOX' }) })
        expect(r.body).toMatchObject({ outcome: 'ignored', reason: 'sandbox' })
        expect(a.plans.size).toBe(0)
        expect(a.events.get('evt-1')?.outcome).toBe('ignored')

        const b = memStore()
        await run(b.store, { event: ev({ environment: 'SANDBOX' }) }, { allowSandbox: true })
        expect(b.plans.get(U)?.plan).toBe('basic')
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

    it('동시에 온 같은 알림: 먼저 잡은 쪽만 처리한다', async () => {
        const { store } = memStore()
        const [a, b] = await Promise.all([run(store, { event: ev() }), run(store, { event: ev() })])
        expect([a.body.outcome, b.body.outcome].sort()).toEqual(['duplicate', 'set'])
    })

    it('조건부 쓰기에서 더 새 알림이 먼저 써 두었으면 stale 로 끝난다', async () => {
        const m = memStore()
        await run(m.store, { event: ev() })
        // 읽은 뒤 다른 처리가 더 새 알림을 써 둔 상황
        const orig = m.store.getPlanRow
        m.store.getPlanRow = async (id) => { const r = await orig(id); m.plans.set(U, { ...m.plans.get(U)!, rc_event_ms: NOW_MS + 999 }); return r }
        const r = await run(m.store, { event: ev({ id: 'evt-2', type: 'RENEWAL', transaction_id: 'tx-2', expiration_at_ms: NOW_MS + 62 * DAY, event_timestamp_ms: NOW_MS + 1 }) })
        expect(r.body).toMatchObject({ outcome: 'stale' })
        expect(m.plans.get(U)!.expires_at).toBe(new Date(NOW_MS + 31 * DAY).toISOString())
    })

    it('저장이 실패하면 500 이고 잡아 둔 알림도 풀어, 다시 보내면 처리된다', async () => {
        const m = memStore()
        m.breakDb()
        expect((await run(m.store, { event: ev() })).status).toBe(500)
        expect(m.events.has('evt-1')).toBe(false)
    })
})
