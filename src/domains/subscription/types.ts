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

export const PLANS: Record<'monthly' | 'annual', PlanInfo> = {
    monthly: { price: 9900, label: '월간 구독', periodDays: 30 },
    annual: { price: 99000, label: '연간 구독', periodDays: 365, discount: '17% 할인' },
}
