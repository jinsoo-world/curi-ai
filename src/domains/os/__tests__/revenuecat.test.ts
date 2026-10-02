import { describe, it, expect } from 'vitest'
import {
    isAuthorized, planFromRevenueCat, pickUserId, decideRevenueCatEvent, minimalPayload, claimVerdict, CLAIM_STALE_MS, RC_KEY_PREFIX, type RcEvent,
} from '../revenuecat'
import type { PlanRowFull } from '../revenuecat'

const NOW = new Date('2026-10-02T00:00:00Z')
const NOW_MS = NOW.getTime()
const U = '11111111-1111-4111-8111-111111111111'
const DAY = 86_400_000

function ev(over: Partial<RcEvent> = {}): RcEvent {
    return {
        id: 'evt-1', type: 'INITIAL_PURCHASE', app_user_id: U, original_app_user_id: U, aliases: [U],
        product_id: 'com.missiondriven.curiai.basic.monthly', entitlement_ids: ['basic'],
        purchased_at_ms: NOW_MS, expiration_at_ms: NOW_MS + 31 * DAY, event_timestamp_ms: NOW_MS,
        environment: 'PRODUCTION', store: 'APP_STORE', ...over,
    }
}
const rcRow = (plan: string, expMs: number, over: Partial<PlanRowFull> = {}): PlanRowFull => ({ plan, expires_at: new Date(expMs).toISOString(), last_order_id: `${RC_KEY_PREFIX}evt-0`, rc_event_ms: NOW_MS - DAY, rc_transaction_id: 'tx-cur', ...over })

describe('os/revenuecat — 열쇠 확인', () => {
    it('Authorization 이 설정값과 똑같을 때만 통과 (길이가 달라도 안전하게)', () => {
        expect(isAuthorized('Bearer s3cret', 'Bearer s3cret')).toBe(true)
        expect(isAuthorized('Bearer s3cre', 'Bearer s3cret')).toBe(false)
        expect(isAuthorized('', 'Bearer s3cret')).toBe(false)
        expect(isAuthorized(null, 'Bearer s3cret')).toBe(false)
        expect(isAuthorized('anything', '')).toBe(false)
        expect(isAuthorized('anything', undefined)).toBe(false)
    })
})

describe('os/revenuecat — 알림 잡기 판정 (claimVerdict)', () => {
    const MIN = 60_000
    it('처리 중으로 5분 넘게 멈춘 알림은 넘겨받고, 5분 안이면 바쁨(500 으로 다시 받기), 끝난 알림은 같은 알림', () => {
        expect(claimVerdict({ outcome: 'processing', claimed_at: new Date(NOW_MS - 6 * MIN).toISOString() }, NOW)).toBe('takeover')
        expect(claimVerdict({ outcome: 'processing', claimed_at: null }, NOW)).toBe('takeover')
        expect(claimVerdict({ outcome: 'processing', claimed_at: new Date(NOW_MS - 4 * MIN).toISOString() }, NOW)).toBe('busy')
        for (const outcome of ['set', 'ignored', 'stale', 'unknown_user']) {
            expect(claimVerdict({ outcome, claimed_at: new Date(NOW_MS - 60 * MIN).toISOString() }, NOW)).toBe('duplicate')
        }
        expect(CLAIM_STALE_MS).toBe(5 * MIN)
    })
})

describe('os/revenuecat — 저장할 알림 내용은 최소한만', () => {
    it('이메일·속성·별칭·회원번호를 빼고 판단에 쓴 칸만 남긴다', () => {
        const m = minimalPayload({ ...ev(), subscriber_attributes: { $email: { value: 'a@b.c' } }, country_code: 'KR' } as RcEvent)
        expect(m).toEqual({
            id: 'evt-1', type: 'INITIAL_PURCHASE', product_id: 'com.missiondriven.curiai.basic.monthly', entitlement_ids: ['basic'],
            purchased_at_ms: NOW_MS, expiration_at_ms: NOW_MS + 31 * DAY, event_timestamp_ms: NOW_MS, environment: 'PRODUCTION', store: 'APP_STORE',
        })
        expect(JSON.stringify(m)).not.toContain(U)
        expect(JSON.stringify(m)).not.toContain('a@b.c')
    })
})

describe('os/revenuecat — 어느 요금제인가', () => {
    it('권한(entitlement) 이름으로 고른다. 둘 다 있으면 프로', () => {
        expect(planFromRevenueCat(ev({ entitlement_ids: ['basic'] }))).toBe('basic')
        expect(planFromRevenueCat(ev({ entitlement_ids: ['basic', 'pro'] }))).toBe('pro')
        expect(planFromRevenueCat(ev({ entitlement_ids: null, entitlement_id: 'pro' }))).toBe('pro')
    })

    it('권한 이름이 constructor·toString 같은 객체 기본 이름이어도 요금제로 착각하지 않는다', () => {
        for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
            expect(planFromRevenueCat(ev({ entitlement_ids: [name], product_id: 'x' }))).toBeNull()
        }
    })

    it('권한이 없으면 상품 이름으로 (아이폰·안드로이드, 안드로이드는 상품:기본요금 꼴도)', () => {
        const p = (product_id: string) => planFromRevenueCat(ev({ entitlement_ids: [], product_id }))
        expect(p('com.missiondriven.curiai.basic.monthly')).toBe('basic')
        expect(p('com.missiondriven.curiai.pro.monthly')).toBe('pro')
        expect(p('basic_monthly')).toBe('basic')
        expect(p('pro_monthly:monthly')).toBe('pro')
        expect(p('pro_monthly:yearly')).toBeNull()
        expect(p('com.missiondriven.curiai.lite.monthly')).toBeNull()
    })

    it('우리 회원번호(UUID)를 app_user_id·별칭에서 찾는다. 익명 번호는 버린다', () => {
        expect(pickUserId(ev())).toBe(U)
        expect(pickUserId(ev({ app_user_id: '$RCAnonymousID:abc', original_app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc', U] }))).toBe(U)
        expect(pickUserId(ev({ app_user_id: '$RCAnonymousID:abc', original_app_user_id: '$RCAnonymousID:abc', aliases: [] }))).toBeNull()
        expect(pickUserId(ev({ app_user_id: U.toUpperCase() }))).toBe(U)
    })
})

describe('os/revenuecat — 알림 종류별 판단', () => {
    it('INITIAL_PURCHASE: 끝나는 날(expiration_at_ms)까지 요금제를 연다', () => {
        const d = decideRevenueCatEvent({ event: ev(), userId: U, planRow: null, now: NOW })
        expect(d).toMatchObject({ kind: 'set', plan: { user_id: U, plan: 'basic', expires_at: new Date(NOW_MS + 31 * DAY).toISOString(), last_order_id: 'revenuecat:evt-1', rc_event_ms: NOW_MS } })
    })

    it('지금 기간의 거래 번호와 알림 시각을 같이 남긴다', () => {
        const d = decideRevenueCatEvent({ event: ev({ transaction_id: 'tx-9' }), userId: U, planRow: null, now: NOW })
        expect(d).toMatchObject({ kind: 'set', plan: { rc_transaction_id: 'tx-9', rc_event_ms: NOW_MS } })
    })

    it('이미 반영한 알림보다 옛 시각의 알림은 무엇이든 버린다 (늦게 온 환불·결제 문제·해지)', () => {
        const row = rcRow('basic', NOW_MS + 31 * DAY, { rc_event_ms: NOW_MS })
        for (const over of [
            { type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', transaction_id: 'tx-cur' },
            { type: 'BILLING_ISSUE', expiration_at_ms: NOW_MS - DAY },
            { type: 'EXPIRATION', expiration_at_ms: NOW_MS - DAY },
            { type: 'RENEWAL', expiration_at_ms: NOW_MS + 90 * DAY },
        ]) {
            const d = decideRevenueCatEvent({ event: ev({ ...over, event_timestamp_ms: NOW_MS - 1000 }), userId: U, planRow: row, now: NOW })
            expect(d, over.type).toMatchObject({ kind: 'ignore', reason: 'stale_event' })
        }
    })

    it('늦게 온 CANCELLATION·BILLING_ISSUE(이미 지난 끝나는 날)는 그 뒤 갱신된 요금제를 지우지 않는다', () => {
        const row = rcRow('basic', NOW_MS + 30 * DAY)
        expect(decideRevenueCatEvent({ event: ev({ type: 'BILLING_ISSUE', expiration_at_ms: NOW_MS - DAY }), userId: U, planRow: row, now: NOW })).toMatchObject({ kind: 'ignore', reason: 'renewed_later' })
        expect(decideRevenueCatEvent({ event: ev({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', expiration_at_ms: NOW_MS - DAY }), userId: U, planRow: row, now: NOW })).toMatchObject({ kind: 'ignore', reason: 'renewed_later' })
    })

    it('환불은 지금 기간의 거래일 때만 무료로. 지난 기간 거래 환불은 지금 요금제를 두고 기록만', () => {
        const row = rcRow('basic', NOW_MS + 30 * DAY, { rc_transaction_id: 'tx-cur' })
        const refund = (transaction_id: string) => ev({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', transaction_id })
        expect(decideRevenueCatEvent({ event: refund('tx-old'), userId: U, planRow: row, now: NOW })).toMatchObject({ kind: 'ignore', reason: 'refund_old_period' })
        expect(decideRevenueCatEvent({ event: refund('tx-cur'), userId: U, planRow: row, now: NOW })).toMatchObject({ kind: 'set', plan: { plan: 'free' } })
    })

    it('레비뉴캣이 연 줄에서 끝나는 날이 늘지 않는 알림은 버린다. 단 프로로 올리기는 받는다', () => {
        const row = rcRow('basic', NOW_MS + 31 * DAY)
        expect(decideRevenueCatEvent({ event: ev({ type: 'RENEWAL', expiration_at_ms: NOW_MS + 31 * DAY }), userId: U, planRow: row, now: NOW }).kind).toBe('ignore')
        expect(decideRevenueCatEvent({ event: ev({ type: 'RENEWAL', entitlement_ids: ['pro'], expiration_at_ms: NOW_MS + 31 * DAY }), userId: U, planRow: row, now: NOW })).toMatchObject({ kind: 'set', plan: { plan: 'pro' } })
        // 프로 줄에 베이직이 같은 날짜로 오면 버린다
        expect(decideRevenueCatEvent({ event: ev({ type: 'RENEWAL', expiration_at_ms: NOW_MS + 31 * DAY }), userId: U, planRow: rcRow('pro', NOW_MS + 31 * DAY), now: NOW }).kind).toBe('ignore')
    })

    it('RENEWAL: 다음 끝나는 날로 바꾼다', () => {
        const d = decideRevenueCatEvent({ event: ev({ id: 'evt-2', type: 'RENEWAL', expiration_at_ms: NOW_MS + 61 * DAY }), userId: U, planRow: rcRow('basic', NOW_MS + DAY), now: NOW })
        expect(d).toMatchObject({ kind: 'set', plan: { plan: 'basic', expires_at: new Date(NOW_MS + 61 * DAY).toISOString() } })
    })

    it('늦게 온 옛 RENEWAL 은 끝나는 날을 앞당기지 않는다', () => {
        const d = decideRevenueCatEvent({ event: ev({ type: 'RENEWAL', expiration_at_ms: NOW_MS + 10 * DAY }), userId: U, planRow: rcRow('basic', NOW_MS + 40 * DAY), now: NOW })
        expect(d).toMatchObject({ kind: 'ignore', reason: 'already_applied' })
    })

    it('UNCANCELLATION: 같은 끝나는 날이면 바꿀 것이 없다, 길어졌으면 바꾼다', () => {
        expect(decideRevenueCatEvent({ event: ev({ type: 'UNCANCELLATION', expiration_at_ms: NOW_MS + 31 * DAY }), userId: U, planRow: rcRow('basic', NOW_MS + 31 * DAY), now: NOW }).kind).toBe('ignore')
        expect(decideRevenueCatEvent({ event: ev({ type: 'UNCANCELLATION', expiration_at_ms: NOW_MS + 31 * DAY }), userId: U, planRow: null, now: NOW }).kind).toBe('set')
    })

    it('CANCELLATION(자동 갱신 끔): 끝나는 날까지는 그대로 쓴다', () => {
        const d = decideRevenueCatEvent({ event: ev({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', expiration_at_ms: NOW_MS + 31 * DAY }), userId: U, planRow: rcRow('basic', NOW_MS + 31 * DAY), now: NOW })
        expect(d.kind).toBe('ignore')
    })

    it('CANCELLATION(환불, CUSTOMER_SUPPORT): 바로 무료로', () => {
        const d = decideRevenueCatEvent({ event: ev({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', transaction_id: 'tx-cur', expiration_at_ms: NOW_MS + 31 * DAY }), userId: U, planRow: rcRow('basic', NOW_MS + 31 * DAY), now: NOW })
        expect(d).toMatchObject({ kind: 'set', plan: { plan: 'free', expires_at: null } })
    })

    it('EXPIRATION: 레비뉴캣이 연 요금제면 무료로. 그 뒤 갱신된 줄이면 건드리지 않는다', () => {
        const exp = ev({ type: 'EXPIRATION', expiration_at_ms: NOW_MS - DAY })
        expect(decideRevenueCatEvent({ event: exp, userId: U, planRow: rcRow('basic', NOW_MS - DAY), now: NOW })).toMatchObject({ kind: 'set', plan: { plan: 'free' } })
        expect(decideRevenueCatEvent({ event: exp, userId: U, planRow: rcRow('basic', NOW_MS + 30 * DAY), now: NOW })).toMatchObject({ kind: 'ignore', reason: 'renewed_later' })
    })

    it('EXPIRATION 이 와도 웹(토스)에서 산 요금제는 건드리지 않는다', () => {
        const toss: PlanRowFull = { plan: 'pro', expires_at: new Date(NOW_MS + 5 * DAY).toISOString(), last_order_id: 'plan_pro_1_x' }
        expect(decideRevenueCatEvent({ event: ev({ type: 'EXPIRATION', expiration_at_ms: NOW_MS - DAY }), userId: U, planRow: toss, now: NOW })).toMatchObject({ kind: 'ignore', reason: 'not_revenuecat_plan' })
    })

    it('BILLING_ISSUE: 끝나는 날이 남았으면 그대로 둔다(유예), 지났으면 무료로', () => {
        expect(decideRevenueCatEvent({ event: ev({ type: 'BILLING_ISSUE', expiration_at_ms: NOW_MS + 3 * DAY }), userId: U, planRow: rcRow('basic', NOW_MS + 3 * DAY), now: NOW }).kind).toBe('ignore')
        expect(decideRevenueCatEvent({ event: ev({ type: 'BILLING_ISSUE', expiration_at_ms: NOW_MS - 1 }), userId: U, planRow: rcRow('basic', NOW_MS - 1), now: NOW })).toMatchObject({ kind: 'set', plan: { plan: 'free' } })
    })

    it('PRODUCT_CHANGE: 바로 적용되지 않을 수 있어 기록만 한다(다음 RENEWAL 이 바꾼다)', () => {
        expect(decideRevenueCatEvent({ event: ev({ type: 'PRODUCT_CHANGE', new_product_id: 'com.missiondriven.curiai.pro.monthly' }), userId: U, planRow: rcRow('basic', NOW_MS + DAY), now: NOW }))
            .toMatchObject({ kind: 'ignore', reason: 'product_change_pending' })
    })

    it('앱에서 프로로 올리면(RENEWAL 에 pro) 프로로', () => {
        const d = decideRevenueCatEvent({ event: ev({ type: 'RENEWAL', entitlement_ids: ['pro'], product_id: 'com.missiondriven.curiai.pro.monthly', expiration_at_ms: NOW_MS + 31 * DAY }), userId: U, planRow: rcRow('basic', NOW_MS + 31 * DAY), now: NOW })
        expect(d).toMatchObject({ kind: 'set', plan: { plan: 'pro' } })
    })

    it('웹에서 산 프로가 남았으면 앱 베이직이 덮지 않는다', () => {
        const toss: PlanRowFull = { plan: 'pro', expires_at: new Date(NOW_MS + 5 * DAY).toISOString(), last_order_id: 'plan_pro_1_x' }
        expect(decideRevenueCatEvent({ event: ev(), userId: U, planRow: toss, now: NOW })).toMatchObject({ kind: 'ignore', reason: 'higher_plan_active' })
    })

    it('모르는 상품은 무시, 이미 끝난 구매는 무시', () => {
        expect(decideRevenueCatEvent({ event: ev({ entitlement_ids: [], product_id: 'x' }), userId: U, planRow: null, now: NOW })).toMatchObject({ kind: 'ignore', reason: 'unknown_product' })
        expect(decideRevenueCatEvent({ event: ev({ expiration_at_ms: NOW_MS - 1 }), userId: U, planRow: null, now: NOW })).toMatchObject({ kind: 'ignore', reason: 'expired' })
    })

    it('TEST·SUBSCRIBER_ALIAS 같은 알림은 무시', () => {
        for (const type of ['TEST', 'SUBSCRIBER_ALIAS', 'NON_RENEWING_PURCHASE']) {
            expect(decideRevenueCatEvent({ event: ev({ type }), userId: U, planRow: null, now: NOW }).kind).toBe('ignore')
        }
    })
})
