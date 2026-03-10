/**
 * 크레딧 도메인 — 조회 함수
 * 잔액 조회, 트랜잭션 히스토리 조회
 */

import { createClient } from '@/lib/supabase/client'
import type { CreditTransaction } from './types'

/** 현재 유저의 크레딧 잔액 조회 */
export async function getCreditBalance(): Promise<number> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    const { data } = await supabase
        .from('users')
        .select('credit_balance')
        .eq('id', user.id)
        .single()

    return data?.credit_balance ?? 0
}

/** 현재 유저의 크레딧 트랜잭션 히스토리 조회 */
export async function getCreditTransactions(
    limit: number = 20
): Promise<CreditTransaction[]> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('Failed to fetch credit transactions:', error)
        return []
    }

    return (data ?? []) as CreditTransaction[]
}

/** 특정 유저의 크레딧 잔액 조회 (서버 전용, admin client 필요) */
export async function getUserCreditBalance(userId: string): Promise<number> {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    const { data } = await supabase
        .from('users')
        .select('credit_balance')
        .eq('id', userId)
        .single()

    return data?.credit_balance ?? 0
}
