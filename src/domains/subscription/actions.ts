// domains/subscription — 구독 비즈니스 로직

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateSubscriptionInput } from './types'
import { PLANS } from './types'

/**
 * 구독 생성 + users 테이블 업데이트
 */
export async function createSubscription(
    db: SupabaseClient,
    input: CreateSubscriptionInput,
) {
    const plan = PLANS[input.planType]
    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setDate(periodEnd.getDate() + plan.periodDays)

    // 1. subscriptions 레코드 생성
    const { data: subscription, error: subError } = await db
        .from('subscriptions')
        .insert({
            user_id: input.userId,
            plan_type: input.planType,
            status: 'active',
            billing_key: input.billingKey,
            customer_key: input.customerKey,
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
        })
        .select()
        .single()

    if (subError || !subscription) {
        console.error('[Subscription] createSubscription error:', subError?.message)
        throw new Error(subError?.message || '구독 생성 실패')
    }

    // 2. users 테이블 업데이트
    const { error: userError } = await db
        .from('users')
        .update({
            subscription_tier: 'premium',
            subscription_id: subscription.id,
            membership_tier: 'subscriber',
            updated_at: now.toISOString(),
        })
        .eq('id', input.userId)

    if (userError) {
        console.error('[Subscription] update user tier error:', userError.message)
    }

    return subscription
}

/**
 * 결제 내역 저장
 */
export async function savePayment(
    db: SupabaseClient,
    data: {
        subscriptionId: string
        userId: string
        tossPaymentKey: string
        tossOrderId: string
        amount: number
        status: 'done' | 'canceled' | 'failed'
        paidAt?: string
        receiptUrl?: string
    },
) {
    const { error } = await db
        .from('payments')
        .insert({
            subscription_id: data.subscriptionId,
            user_id: data.userId,
            toss_payment_key: data.tossPaymentKey,
            toss_order_id: data.tossOrderId,
            amount: data.amount,
            status: data.status,
            paid_at: data.paidAt || new Date().toISOString(),
            receipt_url: data.receiptUrl || null,
        })

    if (error) {
        console.error('[Subscription] savePayment error:', error.message)
        throw new Error(error.message)
    }
}

/**
 * 구독 취소 (다음 결제 주기부터 해지)
 */
export async function cancelSubscription(
    db: SupabaseClient,
    subscriptionId: string,
) {
    const now = new Date().toISOString()

    const { error } = await db
        .from('subscriptions')
        .update({
            status: 'canceled',
            canceled_at: now,
            updated_at: now,
        })
        .eq('id', subscriptionId)

    if (error) {
        console.error('[Subscription] cancelSubscription error:', error.message)
        throw new Error(error.message)
    }
}

/**
 * 구독 갱신 (정기결제 성공 후)
 */
export async function renewSubscription(
    db: SupabaseClient,
    subscriptionId: string,
    planType: 'monthly' | 'annual',
) {
    const plan = PLANS[planType]
    const now = new Date()
    const newPeriodEnd = new Date(now)
    newPeriodEnd.setDate(newPeriodEnd.getDate() + plan.periodDays)

    const { error } = await db
        .from('subscriptions')
        .update({
            current_period_start: now.toISOString(),
            current_period_end: newPeriodEnd.toISOString(),
            status: 'active',
            updated_at: now.toISOString(),
        })
        .eq('id', subscriptionId)

    if (error) {
        console.error('[Subscription] renewSubscription error:', error.message)
        throw new Error(error.message)
    }
}

/**
 * 구독 만료 처리 (기간 끝남 + canceled 상태)
 */
export async function expireSubscription(
    db: SupabaseClient,
    subscriptionId: string,
    userId: string,
) {
    const now = new Date().toISOString()

    // 1. 구독 상태 → expired
    await db
        .from('subscriptions')
        .update({ status: 'expired', updated_at: now })
        .eq('id', subscriptionId)

    // 2. 유저 등급 → free
    await db
        .from('users')
        .update({
            subscription_tier: 'free',
            membership_tier: 'free',
            subscription_id: null,
            updated_at: now,
        })
        .eq('id', userId)
}
