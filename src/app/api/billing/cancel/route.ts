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

        // 구독 취소 (기간 만료 시 자동 해지)
        await cancelSubscription(supabase, subscription.id)

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
