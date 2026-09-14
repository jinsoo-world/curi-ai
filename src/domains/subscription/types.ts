// domains/subscription — 타입 정의

/** 우리가 파는 요금제 전부 */
export type PlanType = 'monthly' | 'annual' | 'pro'

/** 리더(크리에이터)가 자기 AI 를 운영하려고 내는 요금제.
 *  대표 확정 2026-09-14 = 하나만 둔다. 고를 게 둘이면 「뭐가 다르지」를 고민하느라
 *  아무것도 안 고른다. 핵심 기능(내 자료로 AI 가르치기)을 뺀 싼 요금제는
 *  반쪽이라 팔리지 않고, 넣으면 비싼 요금제가 의미가 없다. */
export const LEADER_PLAN_TYPES = ['pro'] as const

export interface Subscription {
    id: string
    user_id: string
    plan_type: PlanType
    status: 'active' | 'canceled' | 'expired' | 'past_due'
    billing_key: string
    customer_key: string
    current_period_start: string
    current_period_end: string
    canceled_at: string | null
    created_at: string
    updated_at: string
}

export interface Payment {
    id: string
    subscription_id: string | null
    user_id: string
    toss_payment_key: string
    toss_order_id: string
    amount: number
    status: 'done' | 'canceled' | 'failed'
    paid_at: string | null
    receipt_url: string | null
    metadata: Record<string, unknown>
    created_at: string
}

export interface CreateSubscriptionInput {
    userId: string
    planType: PlanType
    billingKey: string
    customerKey: string
}

export interface PlanInfo {
    price: number
    label: string
    periodDays: number
    discount?: string
}

// ── v3.0 3축 과금 체계 ──
// 축1: 유저 멤버십 (큐리AI 이용자)
// 축2: 크리에이터 구독 (개별 AI 멘토 구독)
// 축3: 사용량 충전 (토큰 충전 — 향후 Sprint에서 구현)

/** 유저 멤버십 플랜 */
export const USER_PLANS: Record<'basic' | 'premium', PlanInfo> = {
    basic: { price: 7900, label: '베이직', periodDays: 30 },
    premium: { price: 19900, label: '프리미엄', periodDays: 30, discount: '무제한 대화' },
}

/** 리더 구독 — 하나뿐이다. 값을 바꾸려면 여기 숫자 하나만 고치면 된다. */
export const CREATOR_PLANS: Record<'pro', PlanInfo> = {
    pro: { price: 19900, label: '리더 플랜', periodDays: 30 },
}

/**
 * 요금제 하나를 찾는다. **값을 묻는 곳은 전부 이 함수를 쓴다.**
 * 가격표가 여러 군데 흩어져 화면 9,900원 / 실제 청구 7,900원으로 갈렸던 적이 있다(0914).
 */
export function getPlan(planType: PlanType): PlanInfo | undefined {
    return ALL_PLANS[planType]
}

/**
 * 브라우저가 보낸 요금제 이름이 진짜 우리 것인지 확인한다.
 * 이걸 안 보면 아무 이름이나 보내 공짜 구독을 만들 수 있다.
 */
export function isValidPlanType(v: unknown): v is PlanType {
    return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ALL_PLANS, v)
}

/** 레거시 호환 (기존 monthly/annual → basic으로 매핑) */
export const PLANS: Record<'monthly' | 'annual', PlanInfo> = {
    monthly: { price: 7900, label: '월간 구독', periodDays: 30 },
    annual: { price: 79000, label: '연간 구독', periodDays: 365, discount: '17% 할인' },
}

/** 요금제 전부를 한 곳에 모은 표 (getPlan 이 여기서만 읽는다) */
const ALL_PLANS: Record<PlanType, PlanInfo> = {
    monthly: PLANS.monthly,
    annual: PLANS.annual,
    pro: CREATOR_PLANS.pro,
}
