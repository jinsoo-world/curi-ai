// domains/subscription — 구독 비즈니스 로직

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateSubscriptionInput } from './types'
import { PLANS, getPlan } from './types'

/**
 * 구독 생성 + users 테이블 업데이트
 */
export async function createSubscription(
    db: SupabaseClient,
    input: CreateSubscriptionInput,
) {
    const plan = getPlan(input.planType)
    if (!plan) {
        console.error('[Subscription] 모르는 요금제:', input.planType)
        return null
    }
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
    const row = {
        subscription_id: data.subscriptionId,
        user_id: data.userId,
        toss_payment_key: data.tossPaymentKey,
        toss_order_id: data.tossOrderId,
        amount: data.amount,
        status: data.status,
        paid_at: data.paidAt || new Date().toISOString(),
        receipt_url: data.receiptUrl || null,
    }
    // 같은 주문번호는 한 줄만(자동 갱신을 다시 잡아 복구할 때 결제 기록이 두 번 생기지 않게). 고유 색인 = 20261023 마이그레이션
    let { error } = await db.from('payments').upsert(row, { onConflict: 'toss_order_id', ignoreDuplicates: true })
    if (error && error.code === '42P10') {
        // 고유 색인이 아직 없으면(마이그레이션 전) 예전처럼
        ({ error } = await db.from('payments').insert(row))
    }

    if (error) {
        console.error('[Subscription] savePayment error:', error.message)
        throw new Error(error.message)
    }
}

/**
 * 구독 취소 (다음 결제 주기부터 해지).
 * active 일 때만 바꾼다. 자동 갱신 중(renewing)·결제됨 미반영(renew_paid_unsynced)이면 0줄 = false
 * → 부른 쪽이 「결제 처리 중, 잠시 뒤 다시」로 막는다(갱신이 끝나며 해지를 active 로 덮어쓰지 않게).
 */
export async function cancelSubscription(
    db: SupabaseClient,
    subscriptionId: string,
): Promise<boolean> {
    const now = new Date().toISOString()

    const { data, error } = await db
        .from('subscriptions')
        .update({
            status: 'canceled',
            canceled_at: now,
            updated_at: now,
        })
        .eq('id', subscriptionId)
        .in('status', ['active'])
        .select('id')

    if (error) {
        console.error('[Subscription] cancelSubscription error:', error.message)
        throw new Error(error.message)
    }
    return (data ?? []).length > 0
}

/** 갱신 처리 중인 상태 (자동 결제가 잡았거나, 결제는 됐는데 DB 반영 전) */
const IN_RENEWAL = ['renewing', 'renew_paid_unsynced'] as const

/**
 * 구독 갱신 (정기결제 성공 후). 자동 갱신 작업과 renew_paid_unsynced 를 손으로 맞출 때 같은 규칙을 쓴다.
 *  ① 갱신 처리 중이고 해지 신청(cancel_requested_at)이 없으면 → 기간 연장 + active
 *  ② 갱신 처리 중인데 해지 신청이 있으면 → 기간 연장(돈은 냈다) + canceled (해지를 지킨다)
 *  ③ 그 밖에 상태가 바뀌었으면(이미 해지 등) → 기간만 연장, 상태 그대로
 */
export async function renewSubscription(
    db: SupabaseClient,
    subscriptionId: string,
    planType: 'monthly' | 'annual',
): Promise<{ status: string }> {
    const plan = PLANS[planType]
    const now = new Date()
    const newPeriodEnd = new Date(now)
    newPeriodEnd.setDate(newPeriodEnd.getDate() + plan.periodDays)
    const period = {
        current_period_start: now.toISOString(),
        current_period_end: newPeriodEnd.toISOString(),
        updated_at: now.toISOString(),
    }
    const fail = (e: { message: string }): never => {
        console.error('[Subscription] renewSubscription error:', e.message)
        throw new Error(e.message)
    }

    const a = await db.from('subscriptions')
        .update({ ...period, status: 'active' })
        .eq('id', subscriptionId)
        .in('status', [...IN_RENEWAL])
        .is('cancel_requested_at', null)
        .select('id')
    if (a.error) fail(a.error)
    if ((a.data ?? []).length > 0) return { status: 'active' }

    const b = await db.from('subscriptions')
        .update({ ...period, status: 'canceled', canceled_at: now.toISOString() })
        .eq('id', subscriptionId)
        .in('status', [...IN_RENEWAL])
        .select('id, status')
    if (b.error) fail(b.error)
    if ((b.data ?? []).length > 0) {
        console.warn('[Subscription] 갱신 중 해지 신청 — 기간 연장 + canceled:', subscriptionId)
        return { status: 'canceled' }
    }

    const c = await db.from('subscriptions')
        .update(period)
        .eq('id', subscriptionId)
        .select('id, status')
    if (c.error) fail(c.error)
    const row = ((c.data ?? []) as { status: string }[])[0]
    if (!row) throw new Error('갱신할 구독을 찾지 못했어요')
    console.warn('[Subscription] 갱신 중 상태가 바뀜 — 기간만 연장, 상태 유지:', subscriptionId, row.status)
    return { status: row.status }
}

/**
 * 갱신 처리 중(renewing·renew_paid_unsynced·renew_needs_review) 해지 신청.
 * 지금 바로 canceled 로 바꾸면 끝나 가는 결제 처리와 부딪치므로 신청 시각만 찍는다.
 * 다음 결제는 시도하지 않고, 처리가 끝나면(renewSubscription·자동 갱신 작업) canceled 가 된다.
 */
export async function requestCancelDuringRenew(db: SupabaseClient, subscriptionId: string): Promise<boolean> {
    const now = new Date().toISOString()
    const { data, error } = await db.from('subscriptions')
        .update({ cancel_requested_at: now, updated_at: now })
        .eq('id', subscriptionId)
        .in('status', ['renewing', 'renew_paid_unsynced', 'renew_needs_review'])
        .select('id')
    if (error) {
        console.error('[Subscription] requestCancelDuringRenew error:', error.message)
        throw new Error(error.message)
    }
    return (data ?? []).length > 0
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
