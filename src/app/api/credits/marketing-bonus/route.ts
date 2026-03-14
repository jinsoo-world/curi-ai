// /api/credits/marketing-bonus — 마케팅 수신 동의 시 클로버 10개 지급
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const MARKETING_BONUS_AMOUNT = 10

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

        // 중복 지급 방지: 이미 marketing_consent_bonus 거래가 있으면 스킵
        const { data: existing } = await admin
            .from('credit_transactions')
            .select('id')
            .eq('user_id', user.id)
            .eq('type', 'marketing_consent_bonus')
            .limit(1)

        if (existing && existing.length > 0) {
            return NextResponse.json({ message: '이미 지급됨', alreadyGranted: true })
        }

        // marketing_consent가 true인지 확인
        const { data: userData } = await admin
            .from('users')
            .select('clovers, marketing_consent')
            .eq('id', user.id)
            .single()

        if (!userData?.marketing_consent) {
            return NextResponse.json({ error: '마케팅 수신 동의가 필요합니다.' }, { status: 400 })
        }

        const currentBalance = userData?.clovers || 0
        const newBalance = currentBalance + MARKETING_BONUS_AMOUNT

        // 거래 기록 삽입
        const { error: txError } = await admin
            .from('credit_transactions')
            .insert({
                user_id: user.id,
                amount: MARKETING_BONUS_AMOUNT,
                balance_after: newBalance,
                type: 'marketing_consent_bonus',
                description: '🍀 마케팅 수신 동의 보너스 클로버',
            })

        if (txError) {
            console.error('[Marketing Bonus] Transaction error:', txError.message)
            return NextResponse.json({ error: '클로버 지급 실패' }, { status: 500 })
        }

        // 잔액 업데이트
        await admin
            .from('users')
            .update({ clovers: newBalance })
            .eq('id', user.id)

        return NextResponse.json({
            success: true,
            amount: MARKETING_BONUS_AMOUNT,
            balance: newBalance,
        })
    } catch (error: unknown) {
        console.error('[Marketing Bonus] Error:', error)
        const message = error instanceof Error ? error.message : '클로버 지급 중 오류'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
