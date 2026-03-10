/**
 * 크레딧 도메인 — 서버 액션
 * 크레딧 충전, 차감, 가입 보너스 지급
 */

import type { CreditChargeRequest, CreditDeductRequest, CreditTransaction } from './types'
import { CREDIT_CONSTANTS } from './types'

/** 크레딧 충전 (서버 전용) */
export async function chargeCredit(
    request: CreditChargeRequest
): Promise<{ success: boolean; transaction?: CreditTransaction; error?: string }> {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // 현재 잔액 조회
    const { data: user } = await supabase
        .from('users')
        .select('credit_balance')
        .eq('id', request.user_id)
        .single()

    if (!user) return { success: false, error: '유저를 찾을 수 없습니다.' }

    const currentBalance = user.credit_balance ?? 0
    const newBalance = currentBalance + request.amount

    // 트랜잭션 기록
    const { data: tx, error: txError } = await supabase
        .from('credit_transactions')
        .insert({
            user_id: request.user_id,
            amount: request.amount,
            balance_after: newBalance,
            type: request.type,
            description: request.description ?? null,
            mentor_id: request.mentor_id ?? null,
        })
        .select()
        .single()

    if (txError) {
        console.error('Credit charge transaction error:', txError)
        return { success: false, error: '크레딧 충전 처리 중 오류가 발생했습니다.' }
    }

    // 잔액 업데이트
    const { error: updateError } = await supabase
        .from('users')
        .update({ credit_balance: newBalance })
        .eq('id', request.user_id)

    if (updateError) {
        console.error('Credit balance update error:', updateError)
        return { success: false, error: '잔액 업데이트 중 오류가 발생했습니다.' }
    }

    return { success: true, transaction: tx as CreditTransaction }
}

/** 크레딧 차감 (서버 전용) */
export async function deductCredit(
    request: CreditDeductRequest
): Promise<{ success: boolean; remainingBalance?: number; error?: string }> {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // 현재 잔액 조회
    const { data: user } = await supabase
        .from('users')
        .select('credit_balance')
        .eq('id', request.user_id)
        .single()

    if (!user) return { success: false, error: '유저를 찾을 수 없습니다.' }

    const currentBalance = user.credit_balance ?? 0

    // 잔액 부족 체크
    if (currentBalance < request.amount) {
        return {
            success: false,
            remainingBalance: currentBalance,
            error: '크레딧이 부족합니다. 충전 후 다시 시도해주세요.',
        }
    }

    const newBalance = currentBalance - request.amount

    // 트랜잭션 기록 (차감은 음수)
    const { error: txError } = await supabase
        .from('credit_transactions')
        .insert({
            user_id: request.user_id,
            amount: -request.amount,
            balance_after: newBalance,
            type: 'chat_usage',
            description: request.description ?? '대화 크레딧 차감',
            mentor_id: request.mentor_id,
        })

    if (txError) {
        console.error('Credit deduct transaction error:', txError)
        return { success: false, error: '크레딧 차감 처리 중 오류가 발생했습니다.' }
    }

    // 잔액 업데이트
    const { error: updateError } = await supabase
        .from('users')
        .update({ credit_balance: newBalance })
        .eq('id', request.user_id)

    if (updateError) {
        console.error('Credit balance update error:', updateError)
        return { success: false, error: '잔액 업데이트 중 오류가 발생했습니다.' }
    }

    return { success: true, remainingBalance: newBalance }
}

/** 가입 보너스 크레딧 지급 (1만원) */
export async function grantSignupBonus(userId: string): Promise<boolean> {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // 이미 보너스 받았는지 확인
    const { data: existingBonus } = await supabase
        .from('credit_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'signup_bonus')
        .limit(1)

    if (existingBonus && existingBonus.length > 0) {
        console.log('Signup bonus already granted for user:', userId)
        return false
    }

    const result = await chargeCredit({
        user_id: userId,
        amount: CREDIT_CONSTANTS.SIGNUP_BONUS,
        type: 'signup_bonus',
        description: '🎉 가입 축하 크레딧',
    })

    return result.success
}
