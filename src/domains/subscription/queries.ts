// domains/subscription — 구독 데이터 조회

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Subscription, Payment } from './types'

/**
 * 활성 구독 조회
 */
export async function getActiveSubscription(
    db: SupabaseClient,
    userId: string,
): Promise<Subscription | null> {
    const { data, error } = await db
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'canceled']) // canceled도 기간 내에는 유효
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        console.error('[Subscription] getActiveSubscription error:', error.message)
    }
    return data as Subscription | null
}

/**
 * 구독 ID로 조회
 */
export async function getSubscriptionById(
    db: SupabaseClient,
    subscriptionId: string,
): Promise<Subscription | null> {
    const { data, error } = await db
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single()

    if (error) {
        console.error('[Subscription] getSubscriptionById error:', error.message)
    }
    return data as Subscription | null
}

/**
 * 결제 내역 조회 (최근순)
 */
export async function getPaymentHistory(
    db: SupabaseClient,
    userId: string,
    limit = 10,
): Promise<Payment[]> {
    const { data, error } = await db
        .from('payments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('[Subscription] getPaymentHistory error:', error.message)
    }
    return (data as Payment[]) || []
}

/**
 * 갱신 대상 구독 조회 (current_period_end가 오늘 이전인 active 구독)
 */
export async function getExpiredSubscriptions(
    db: SupabaseClient,
): Promise<Subscription[]> {
    const now = new Date().toISOString()

    const { data, error } = await db
        .from('subscriptions')
        .select('*')
        .eq('status', 'active')
        .lte('current_period_end', now)

    if (error) {
        console.error('[Subscription] getExpiredSubscriptions error:', error.message)
    }
    return (data as Subscription[]) || []
}
