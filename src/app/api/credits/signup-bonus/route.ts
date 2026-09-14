// /api/credits/signup-bonus — 잠갔다 (2026-09-15)
//
// 여기는 가입만 하면 클로버 10,000개(25만원어치)를 주도록 되어 있었다.
// 대표 확정은 다르다 — 0915 「무료체험권 넣으면 100클로버 줘」.
// 실제로 한 번도 지급된 적이 없다(거래 기록 0건). 부르는 곳도 없다.
// 그래도 살려두면 언젠가 잘못 이어져 큰돈이 나간다. 그래서 막아둔다.
// 되살리려면 금액부터 대표에게 확인한다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST() {
    return NextResponse.json(
        { error: '지금은 쓰지 않는 길입니다. 체험권을 받으면 클로버를 드립니다.' },
        { status: 410 },
    )
}

async function 옛지급_잠금됨() {
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
            .select('clovers')
            .eq('id', user.id)
            .single()

        const currentBalance = userData?.clovers ?? 0
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
                description: '🍀 가입 축하 클로버 10,000개',
            })

        if (txError) {
            console.error('[Signup Bonus] Transaction error:', txError.message)
            return NextResponse.json({ error: '클로버 지급 실패' }, { status: 500 })
        }

        // 잔액 업데이트
        await admin
            .from('users')
            .update({ clovers: newBalance })
            .eq('id', user.id)

        return NextResponse.json({
            success: true,
            amount: bonusAmount,
            balance: newBalance,
        })
    } catch (error: unknown) {
        console.error('[Signup Bonus] Error:', error)
        const message = error instanceof Error ? error.message : '클로버 지급 중 오류'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
