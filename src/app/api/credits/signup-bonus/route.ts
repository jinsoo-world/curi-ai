// /api/credits/signup-bonus — 가입 시 1만원 크레딧 자동 지급
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 중복 지급 방지: 이미 signup_bonus 거래가 있으면 스킵
        const { data: existing } = await admin
            .from('credit_transactions')
            .select('id')
            .eq('user_id', user.id)
            .eq('type', 'signup_bonus')
            .limit(1)

        if (existing && existing.length > 0) {
            return NextResponse.json({ message: '이미 지급됨', alreadyGranted: true })
        }

        // 현재 잔액 조회
        const { data: userData } = await admin
            .from('users')
            .select('credit_balance')
            .eq('id', user.id)
            .single()

        const currentBalance = userData?.credit_balance ?? 0
        const bonusAmount = 10000
        const newBalance = currentBalance + bonusAmount

        // 거래 기록 삽입
        const { error: txError } = await admin
            .from('credit_transactions')
            .insert({
                user_id: user.id,
                amount: bonusAmount,
                balance_after: newBalance,
                type: 'signup_bonus',
                description: '🎉 가입 축하 1만원 크레딧',
            })

        if (txError) {
            console.error('[Signup Bonus] Transaction error:', txError.message)
            return NextResponse.json({ error: '크레딧 지급 실패' }, { status: 500 })
        }

        // 잔액 업데이트
        await admin
            .from('users')
            .update({ credit_balance: newBalance })
            .eq('id', user.id)

        return NextResponse.json({
            success: true,
            amount: bonusAmount,
            balance: newBalance,
        })
    } catch (error: unknown) {
        console.error('[Signup Bonus] Error:', error)
        const message = error instanceof Error ? error.message : '크레딧 지급 중 오류'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
