// /api/credits/signup-bonus — 가입 선물 100 클로버
//
// 대표 확정 2026-09-15 「가입 보너스는 100개로 통일」.
// 전에는 여기가 10,000개(25만원어치)를 주도록 되어 있었다. 실제 지급은 0건이었고,
// 값을 100 으로 맞춰 다시 연다. 금액은 SIGNUP_CLOVERS 한 곳에서만 읽는다.
// 같은 사람에게 두 번 주지 않는다(거래 기록에 signup_bonus 가 있으면 건너뛴다).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { SIGNUP_CLOVERS } from '@/domains/trial'

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

        // 더하기는 DB 가 한다. 읽어서 덮어쓰면 겹쳐 눌렀을 때 한쪽이 통째로 사라진다.
        const { data: 새잔액, error: 더하기오류 } = await admin.rpc('클로버_더하기', {
            그사람: user.id,
            더할값: SIGNUP_CLOVERS,
        })
        if (더하기오류) {
            console.error('[Signup Bonus] 지급 실패:', 더하기오류.message)
            return NextResponse.json({ error: '클로버 지급 실패' }, { status: 500 })
        }

        const { error: txError } = await admin
            .from('credit_transactions')
            .insert({
                user_id: user.id,
                amount: SIGNUP_CLOVERS,
                balance_after: 새잔액 ?? SIGNUP_CLOVERS,
                type: 'signup_bonus',
                description: '가입 선물',
            })
        if (txError) {
            console.error('[Signup Bonus] 기록 실패:', txError.message)
        }

        return NextResponse.json({
            success: true,
            amount: SIGNUP_CLOVERS,
            balance: 새잔액 ?? SIGNUP_CLOVERS,
        })
    } catch (error: unknown) {
        console.error('[Signup Bonus] Error:', error)
        const message = error instanceof Error ? error.message : '클로버 지급 중 오류'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
