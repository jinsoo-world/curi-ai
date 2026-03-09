// domains/subscription — 타입 정의

export interface Subscription {
    id: string
    user_id: string
    plan_type: 'monthly' | 'annual'
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
    planType: 'monthly' | 'annual'
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

/** 크리에이터 AI 구독 플랜 */
export const CREATOR_PLANS: Record<'starter' | 'pro', PlanInfo> = {
    starter: { price: 9900, label: '크리에이터 스타터', periodDays: 30 },
    pro: { price: 19900, label: '크리에이터 프로', periodDays: 30, discount: 'RAG + 보이스' },
}

/** 레거시 호환 (기존 monthly/annual → basic으로 매핑) */
export const PLANS: Record<'monthly' | 'annual', PlanInfo> = {
    monthly: { price: 7900, label: '월간 구독', periodDays: 30 },
    annual: { price: 79000, label: '연간 구독', periodDays: 365, discount: '17% 할인' },
}
