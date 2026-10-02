// 레비뉴캣에 직접 물어 요금제를 맞추기 (넘겨받은 구독, 로그인 전에 산 구독)
import { describe, it, expect, vi } from 'vitest'
import { planFromSubscriber, syncRevenueCatUser, shouldSyncRevenueCat, SYNC_CACHE_MAX, type RcSubscriber } from '../revenuecat-sync'
import type { PlanRowFull, UserPlanWrite } from '../revenuecat'

const NOW = new Date('2026-10-02T00:00:00Z')
const U = '11111111-1111-4111-8111-111111111111'
const later = '2026-11-02T00:00:00Z'
const past = '2026-09-02T00:00:00Z'

function subscriber(over: Partial<RcSubscriber> = {}): RcSubscriber {
    return {
        entitlements: { basic: { expires_date: later, product_identifier: 'com.missiondriven.curiai.basic.monthly' } },
        subscriptions: { 'com.missiondriven.curiai.basic.monthly': { expires_date: later, is_sandbox: false, store_transaction_id: 'tx-5' } },
        ...over,
    }
}

describe('planFromSubscriber', () => {
    it('살아 있는 권한 중 높은 요금제와 끝나는 날', () => {
        expect(planFromSubscriber(subscriber(), NOW, false)).toEqual({ plan: 'basic', expiresAt: new Date(later), transactionId: 'tx-5' })
        const both = subscriber({
            entitlements: {
                basic: { expires_date: later, product_identifier: 'com.missiondriven.curiai.basic.monthly' },
                pro: { expires_date: '2026-10-20T00:00:00Z', product_identifier: 'pro_monthly:monthly' },
            },
            subscriptions: { 'pro_monthly:monthly': { expires_date: '2026-10-20T00:00:00Z', is_sandbox: false } },
        })
        expect(planFromSubscriber(both, NOW, false)?.plan).toBe('pro')
    })

    it('끝난 권한, 모르는 권한, 기한 없는 권한은 없음', () => {
        expect(planFromSubscriber(subscriber({ entitlements: { basic: { expires_date: past, product_identifier: 'x' } } }), NOW, false)).toBeNull()
        expect(planFromSubscriber(subscriber({ entitlements: { vip: { expires_date: later, product_identifier: 'x' } } }), NOW, false)).toBeNull()
        expect(planFromSubscriber(subscriber({ entitlements: { basic: { expires_date: null, product_identifier: 'x' } } }), NOW, false)).toBeNull()
    })

    it('권한에 맞는 구독 줄이 없으면 열지 않는다 (레비뉴캣이 직접 준 promotional 만 예외)', () => {
        const orphan = subscriber({ subscriptions: {} })
        expect(planFromSubscriber(orphan, NOW, false)).toBeNull()
        const promo = subscriber({ entitlements: { pro: { expires_date: later, product_identifier: 'rc_promo_pro_monthly', store: 'promotional' } }, subscriptions: {} })
        expect(planFromSubscriber(promo, NOW, false)?.plan).toBe('pro')
        const promoSub = subscriber({ entitlements: { pro: { expires_date: later, product_identifier: 'rc_promo_pro_monthly' } }, subscriptions: { rc_promo_pro_monthly: { expires_date: later, store: 'promotional' } } })
        expect(planFromSubscriber(promoSub, NOW, false)?.plan).toBe('pro')
    })

    it('권한 이름이 constructor 같은 객체 기본 이름이면 무시', () => {
        expect(planFromSubscriber(subscriber({ entitlements: { constructor: { expires_date: later, product_identifier: 'com.missiondriven.curiai.basic.monthly' } } as never }), NOW, false)).toBeNull()
    })

    it('샌드박스 구독은 허용할 때만', () => {
        const sb = subscriber({ subscriptions: { 'com.missiondriven.curiai.basic.monthly': { expires_date: later, is_sandbox: true } } })
        expect(planFromSubscriber(sb, NOW, false)).toBeNull()
        expect(planFromSubscriber(sb, NOW, true)?.plan).toBe('basic')
    })
})

function deps(over: { row?: PlanRowFull | null; body?: unknown; status?: number; secret?: string; statuses?: number[] } = {}) {
    const saved: UserPlanWrite[] = []
    const statuses = [...(over.statuses ?? [])]
    const fetchFn = vi.fn(async (...args: [string, RequestInit?]) => { void args; return new Response(JSON.stringify(over.body ?? { subscriber: subscriber() }), { status: statuses.shift() ?? over.status ?? 200 }) })
    return {
        saved,
        fetchFn,
        args: {
            userId: U,
            secret: 'secret' in over ? over.secret : 'sk_test',
            allowSandbox: false,
            fetch: fetchFn as unknown as typeof fetch,
            store: {
                getPlanRow: async () => over.row ?? null,
                savePlan: async (w: UserPlanWrite, _expected: PlanRowFull | null) => { void _expected; saved.push(w); return true },
            },
            cache: new Map<string, number>(),
            now: NOW,
        },
    }
}

describe('syncRevenueCatUser', () => {
    it('레비뉴캣에 묻고 살아 있는 권한으로 요금제를 연다', async () => {
        const d = deps()
        const r = await syncRevenueCatUser(d.args)
        expect(r).toBe('set')
        expect(d.fetchFn).toHaveBeenCalledWith(`https://api.revenuecat.com/v1/subscribers/${U}`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sk_test' }) }))
        // 3초 안에 답이 없으면 끊는다
        expect(d.fetchFn.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
        expect(d.saved[0]).toMatchObject({ user_id: U, plan: 'basic', expires_at: '2026-11-02T00:00:00.000Z', rc_event_ms: NOW.getTime(), rc_transaction_id: 'tx-5' })
        expect(d.saved[0].last_order_id.startsWith('revenuecat:')).toBe(true)
    })

    it('60초 안에 다시 부르면 묻지 않는다, 지나면 다시 묻는다', async () => {
        const d = deps()
        await syncRevenueCatUser(d.args)
        expect(await syncRevenueCatUser({ ...d.args, now: new Date(NOW.getTime() + 30_000) })).toBe('cached')
        expect(d.fetchFn).toHaveBeenCalledTimes(1)
        await syncRevenueCatUser({ ...d.args, now: new Date(NOW.getTime() + 61_000) })
        expect(d.fetchFn).toHaveBeenCalledTimes(2)
    })

    it('비밀 열쇠가 없으면 묻지 않는다', async () => {
        const d = deps({ secret: undefined })
        expect(await syncRevenueCatUser(d.args)).toBe('not_configured')
        expect(d.fetchFn).not.toHaveBeenCalled()
    })

    it('권한이 없거나 레비뉴캣이 모르면 바꾸지 않는다', async () => {
        const none = deps({ body: { subscriber: { entitlements: {}, subscriptions: {} } } })
        expect(await syncRevenueCatUser(none.args)).toBe('none')
        const missing = deps({ status: 404, body: {} })
        expect(await syncRevenueCatUser(missing.args)).toBe('none')
        expect(none.saved.length + missing.saved.length).toBe(0)
    })

    it('웹(토스)에서 산 더 높은 요금제가 남았으면 덮지 않는다', async () => {
        const d = deps({ row: { plan: 'pro', expires_at: '2026-10-20T00:00:00Z', last_order_id: 'plan_pro_1_x' } })
        expect(await syncRevenueCatUser(d.args)).toBe('ignored')
        expect(d.saved).toHaveLength(0)
    })

    it('실패한 조회는 기억하지 않는다 (바로 다시 물을 수 있다)', async () => {
        const d = deps({ statuses: [500, 200] })
        expect(await syncRevenueCatUser(d.args)).toBe('error')
        expect(await syncRevenueCatUser({ ...d.args, now: new Date(NOW.getTime() + 1000) })).toBe('set')
        expect(d.fetchFn).toHaveBeenCalledTimes(2)
    })

    it('기억 칸은 5,000명까지, 넘으면 가장 오래된 것부터 버린다', async () => {
        const d = deps()
        for (let i = 0; i < SYNC_CACHE_MAX; i++) d.args.cache.set(`old-${i}`, NOW.getTime())
        await syncRevenueCatUser(d.args)
        expect(SYNC_CACHE_MAX).toBe(5000)
        expect(d.args.cache.size).toBe(SYNC_CACHE_MAX)
        expect(d.args.cache.has('old-0')).toBe(false)
        expect(d.args.cache.has(U)).toBe(true)
    })
})

describe('shouldSyncRevenueCat — 누구에게만 레비뉴캣에 묻나', () => {
    it('앱에서 온 요청이거나, 레비뉴캣 흔적(알림 기록, 레비뉴캣이 연 줄)이 있는 사람만', () => {
        expect(shouldSyncRevenueCat({ fromApp: true, planRow: null, hasEventTrace: false })).toBe(true)
        expect(shouldSyncRevenueCat({ fromApp: false, planRow: { plan: 'free', expires_at: null, last_order_id: 'revenuecat:evt-1' }, hasEventTrace: false })).toBe(true)
        expect(shouldSyncRevenueCat({ fromApp: false, planRow: null, hasEventTrace: true })).toBe(true)
        // 웹에서만 쓰는 무료 회원은 묻지 않는다(레비뉴캣에 빈 고객이 생긴다)
        expect(shouldSyncRevenueCat({ fromApp: false, planRow: null, hasEventTrace: false })).toBe(false)
        expect(shouldSyncRevenueCat({ fromApp: false, planRow: { plan: 'basic', expires_at: null, last_order_id: 'plan_basic_1_x' }, hasEventTrace: false })).toBe(false)
    })
})
