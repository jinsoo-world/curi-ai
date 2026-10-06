// /api/billing/cancel — 구독 취소
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createBrowserClient } from '@/lib/supabase/server'
import { cancelSubscription, getActiveSubscription } from '@/domains/subscription'
import { sendErrorAlert } from '@/lib/slack'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        // 인증 확인
        const browserClient = await createBrowserClient()
        const { data: { user } } = await browserClient.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        // 서비스 롤 클라이언트
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 활성 구독 조회
        const subscription = await getActiveSubscription(supabase, user.id)
        if (!subscription) {
            return NextResponse.json({ error: '활성 구독이 없습니다.' }, { status: 404 })
        }

        if (subscription.status === 'canceled') {
            return NextResponse.json({ error: '이미 취소된 구독입니다.' }, { status: 400 })
        }

        // 자동 갱신 결제가 진행 중이면 막는다(갱신이 끝나며 해지를 덮어쓰지 않게, 결제는 이미 나갔을 수 있다)
        if (subscription.status !== 'active') {
            return NextResponse.json({ error: '자동 결제를 처리하는 중이에요. 잠시 뒤 다시 해지해 주세요.' }, { status: 409 })
        }

        // 구독 취소 (기간 만료 시 자동 해지). active 일 때만 바뀐다 = 그사이 갱신이 잡았으면 0줄
        const 해지됨 = await cancelSubscription(supabase, subscription.id)
        if (!해지됨) {
            return NextResponse.json({ error: '자동 결제를 처리하는 중이에요. 잠시 뒤 다시 해지해 주세요.' }, { status: 409 })
        }

        return NextResponse.json({
            success: true,
            message: `구독이 취소되었습니다. ${new Date(subscription.current_period_end).toLocaleDateString('ko-KR')}까지 프리미엄을 이용하실 수 있습니다.`,
            periodEnd: subscription.current_period_end,
        })
    } catch (error: unknown) {
        console.error('[Billing] Cancel error:', error)
        const message = error instanceof Error ? error.message : '구독 취소 중 오류가 발생했습니다.'
        await sendErrorAlert({ source: 'billing/cancel', error: message })
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
