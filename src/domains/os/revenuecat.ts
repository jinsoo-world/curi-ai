// domains/os — 앱 안 구독(아이폰·안드로이드)을 레비뉴캣(RevenueCat)으로 받는 판단 (대표 결정 1002)
//
// 앱은 결제를 레비뉴캣 SDK 로 하고, 로그인할 때 Purchases.logIn(우리 회원번호 users.id) 를 부른다.
// 레비뉴캣이 웹훅으로 알려 주면 웹(토스)과 같은 user_plans 표 한 줄을 고친다.
//   어디서 열렸는지 = last_order_id 접두사. 토스 plan_… / 레비뉴캣 revenuecat:<알림 id>
//
// 원칙
//  ① 기간은 「한 달 더하기」가 아니라 레비뉴캣이 알려준 끝나는 날(expiration_at_ms)로 「맞춘다」. 같은 알림이 두 번 와도 두 번 늘지 않는다
//  ② 늦게 온 옛 알림이 끝나는 날을 앞당기지 않는다
//  ③ 웹(토스)에서 산 더 높은 요금제가 남아 있으면 앱 구매가 덮지 않는다. 앱 쪽 만료·환불도 웹 요금제를 건드리지 않는다
// 순수 계산만 여기. DB 는 revenuecat-service.ts 가 한다.
import { createHash, timingSafeEqual } from 'crypto'
import { planRank, resolvePlan, type PaidPlanId, type PlanId } from './plan'

export const RC_KEY_PREFIX = 'revenuecat:'

/** 레비뉴캣 권한(entitlement) 이름 = 우리 요금제 이름 */
export const RC_ENTITLEMENTS: Record<string, PaidPlanId> = { basic: 'basic', pro: 'pro' }

/** 스토어 상품 이름 (권한 이름이 안 왔을 때 쓴다) */
export const IAP_PRODUCTS: { plan: PaidPlanId; ios: string; android: string }[] = [
    { plan: 'basic', ios: 'com.missiondriven.curiai.basic.monthly', android: 'basic_monthly' },
    { plan: 'pro', ios: 'com.missiondriven.curiai.pro.monthly', android: 'pro_monthly' },
]
export const ANDROID_BASE_PLAN = 'monthly'

/** 레비뉴캣 웹훅 event 안에서 우리가 읽는 칸 */
export interface RcEvent {
    id: string
    type: string
    app_user_id?: string | null
    original_app_user_id?: string | null
    aliases?: string[] | null
    product_id?: string | null
    new_product_id?: string | null
    entitlement_ids?: string[] | null
    entitlement_id?: string | null
    purchased_at_ms?: number | null
    expiration_at_ms?: number | null
    event_timestamp_ms?: number | null
    environment?: string | null
    store?: string | null
    cancel_reason?: string | null
    transaction_id?: string | null
    original_transaction_id?: string | null
    transferred_from?: string[] | null
    transferred_to?: string[] | null
}

export interface PlanRowFull {
    plan: string | null
    expires_at: string | null
    last_order_id: string | null
}

export interface UserPlanWrite {
    user_id: string
    plan: PlanId
    started_at: string
    expires_at: string | null
    last_order_id: string
    updated_at: string
}

/** Authorization 머리글이 설정값과 같은가. 길이가 달라도 시간이 같게(해시끼리 비교) */
export function isAuthorized(header: string | null | undefined, secret: string | null | undefined): boolean {
    if (!secret || !header) return false
    const a = createHash('sha256').update(header).digest()
    const b = createHash('sha256').update(secret).digest()
    return timingSafeEqual(a, b)
}

function planFromProduct(productId: string | null | undefined): PaidPlanId | null {
    if (!productId) return null
    const ios = IAP_PRODUCTS.find(p => p.ios === productId)
    if (ios) return ios.plan
    // 안드로이드는 레비뉴캣이 「상품:기본요금」 꼴로 보낼 수 있다
    const [sub, base] = productId.split(':')
    if (base !== undefined && base !== ANDROID_BASE_PLAN) return null
    return IAP_PRODUCTS.find(p => p.android === sub)?.plan ?? null
}

/** 이 알림이 어느 요금제인가. 권한 이름 먼저(둘 다면 높은 쪽), 없으면 상품 이름 */
export function planFromRevenueCat(e: RcEvent): PaidPlanId | null {
    const ents = [...(e.entitlement_ids ?? []), ...(e.entitlement_id ? [e.entitlement_id] : [])]
    const fromEnt = ents.map(x => RC_ENTITLEMENTS[x]).filter((x): x is PaidPlanId => !!x)
    if (fromEnt.length) return fromEnt.sort((a, b) => planRank(b) - planRank(a))[0]
    return planFromProduct(e.product_id)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
    return typeof v === 'string' && UUID.test(v)
}

/** 우리 회원번호(UUID) 찾기. app_user_id → original_app_user_id → 별칭 순. 익명 번호($RCAnonymousID)는 버린다 */
export function pickUserId(e: RcEvent): string | null {
    const ids = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])]
    const hit = ids.find(isUuid)
    return hit ? hit.toLowerCase() : null
}

export type RcDecision =
    | { kind: 'ignore'; reason: string }
    | { kind: 'set'; plan: UserPlanWrite; reason: string }

/** 요금제를 여는(맞추는) 알림 */
const SYNC_TYPES = new Set([
    'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'CANCELLATION', 'BILLING_ISSUE',
    'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT', 'REFUND_REVERSED',
])

const iso = (d: Date) => d.toISOString()

/** 우리가 다루는 알림인가 (TEST, SUBSCRIBER_ALIAS 같은 것은 사람을 찾지도 않고 무시) */
export function isHandledType(type: string): boolean {
    return SYNC_TYPES.has(type) || type === 'EXPIRATION' || type === 'PRODUCT_CHANGE' || type === 'TRANSFER'
}

/**
 * 알림 한 건(사람 한 명)을 어떻게 할지.
 *   INITIAL_PURCHASE · RENEWAL · UNCANCELLATION · SUBSCRIPTION_EXTENDED   끝나는 날까지 연다(더 늦은 날로만)
 *   CANCELLATION   자동 갱신 끔이면 끝나는 날까지 그대로. 환불(CUSTOMER_SUPPORT)이거나 이미 지났으면 무료로
 *   BILLING_ISSUE  끝나는 날이 남았으면 그대로(유예). 지났으면 무료로
 *   EXPIRATION     레비뉴캣이 연 요금제면 무료로. 그 뒤 갱신된 줄이면 그대로
 *   PRODUCT_CHANGE 바로 적용되지 않을 수 있어 기록만. 새 상품은 다음 RENEWAL 이 바꾼다
 *   TRANSFER       revenuecat-service.ts 가 사람마다 endRevenueCatPlan 으로 처리
 *   그 밖(TEST, SUBSCRIBER_ALIAS 등)  무시
 */
export function decideRevenueCatEvent(a: { event: RcEvent; userId: string; planRow: PlanRowFull | null; now: Date }): RcDecision {
    const { event: e, userId, planRow, now } = a
    const key = `${RC_KEY_PREFIX}${e.id}`
    const exp = typeof e.expiration_at_ms === 'number' ? new Date(e.expiration_at_ms) : null
    const ended = !exp || exp.getTime() <= now.getTime()

    if (e.type === 'PRODUCT_CHANGE') return { kind: 'ignore', reason: 'product_change_pending' }

    if (e.type === 'EXPIRATION') {
        if (planRow && tied(planRow) && planRow.expires_at && exp && new Date(planRow.expires_at).getTime() > exp.getTime()) {
            return { kind: 'ignore', reason: 'renewed_later' }
        }
        return endRevenueCatPlan({ userId, planRow, key, now })
    }

    if (!SYNC_TYPES.has(e.type)) return { kind: 'ignore', reason: `unhandled:${e.type}` }

    const refund = e.type === 'CANCELLATION' && e.cancel_reason === 'CUSTOMER_SUPPORT'
    if (refund || ((e.type === 'CANCELLATION' || e.type === 'BILLING_ISSUE') && ended)) {
        return endRevenueCatPlan({ userId, planRow, key, now })
    }

    const plan = planFromRevenueCat(e)
    if (!plan) return { kind: 'ignore', reason: 'unknown_product' }
    if (ended) return { kind: 'ignore', reason: 'expired' }

    const cur = resolvePlan(planRow, now)
    if (planRow && tied(planRow)) {
        // 앱이 연 요금제면 레비뉴캣을 따른다. 같은 요금제는 더 늦은 날로만 바꾼다
        if (cur.plan === plan && cur.expiresAt && new Date(cur.expiresAt).getTime() >= exp!.getTime()) {
            return { kind: 'ignore', reason: 'already_applied' }
        }
    } else if (cur.plan !== 'free' && planRank(cur.plan) > planRank(plan)) {
        return { kind: 'ignore', reason: 'higher_plan_active' }
    } else if (cur.plan === plan && (!cur.expiresAt || new Date(cur.expiresAt).getTime() >= exp!.getTime())) {
        return { kind: 'ignore', reason: 'already_longer' }
    }

    return { kind: 'set', reason: e.type, plan: { user_id: userId, plan, started_at: iso(now), expires_at: iso(exp!), last_order_id: key, updated_at: iso(now) } }
}

function tied(row: PlanRowFull): boolean {
    return !!row.last_order_id?.startsWith(RC_KEY_PREFIX)
}

/** 레비뉴캣이 연 요금제면 무료로 닫는다. 웹(토스) 요금제는 건드리지 않는다 */
export function endRevenueCatPlan(a: { userId: string; planRow: PlanRowFull | null; key: string; now: Date }): RcDecision {
    const { userId, planRow, key, now } = a
    if (!planRow || !tied(planRow)) return { kind: 'ignore', reason: 'not_revenuecat_plan' }
    if (planRow.plan === 'free') return { kind: 'ignore', reason: 'already_free' }
    return { kind: 'set', reason: 'end', plan: { user_id: userId, plan: 'free', started_at: iso(now), expires_at: null, last_order_id: key, updated_at: iso(now) } }
}
