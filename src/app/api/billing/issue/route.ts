// /api/billing/issue — 빌링키 발급 + 첫 결제
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { issueBillingKey, chargeBilling, generateOrderId } from '@/lib/toss'
import { createSubscription, savePayment, getPlan, isValidPlanType } from '@/domains/subscription'
import { sendErrorAlert } from '@/lib/slack'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const { authKey, customerKey, planType } = await req.json()

        // 🔒 누구 구독인지는 로그인 정보에서만 정한다.
        // 브라우저가 보낸 회원번호를 믿으면 남의 계정을 유료로 만들 수 있었다.
        const authDb = await createServerClient()
        const { data: { user } } = await authDb.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }
        const userId = user.id

        if (!authKey || !customerKey || !planType) {
            return NextResponse.json(
                { error: '필수 파라미터가 누락되었습니다.' },
                { status: 400 },
            )
        }

        // 브라우저가 보낸 이름을 그대로 믿지 않는다. 우리 표에 있는 것만 통과.
        if (!isValidPlanType(planType)) {
            return NextResponse.json(
                { error: '잘못된 플랜 타입입니다.' },
                { status: 400 },
            )
        }

        const plan = getPlan(planType)!

        // Supabase 서비스 롤 클라이언트 (RLS 우회)
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 🔒 이미 구독 중이면 새로 만들지 않는다.
        // 확인 없이 만들면 구독이 겹치고, 매일 도는 자동결제가 두 번 긁는다.
        const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('id, status')
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle()
        if (existingSub) {
            return NextResponse.json(
                { error: '이미 구독 중입니다. 기존 구독을 해지한 뒤 다시 시도해 주세요.' },
                { status: 409 },
            )
        }

        // 1. 빌링키 발급
        console.log('[Billing] Issuing billing key for user:', userId)
        const billingResult = await issueBillingKey(authKey, customerKey)
        console.log('[Billing] Billing key issued:', billingResult.billingKey.substring(0, 8) + '...')

        // 2. 즉시 첫 결제
        const orderId = generateOrderId(planType)
        console.log('[Billing] Charging first payment, orderId:', orderId)
        const paymentResult = await chargeBilling(
            billingResult.billingKey,
            customerKey,
            plan.price,
            orderId,
            `큐리AI ${plan.label}`,
        )
        console.log('[Billing] Payment successful:', paymentResult.paymentKey)

        // 3. 구독 생성
        const subscription = await createSubscription(supabase, {
            userId,
            planType,
            billingKey: billingResult.billingKey,
            customerKey,
        })

        // 4. 결제 내역 저장
        await savePayment(supabase, {
            subscriptionId: subscription.id,
            userId,
            tossPaymentKey: paymentResult.paymentKey,
            tossOrderId: paymentResult.orderId,
            amount: paymentResult.totalAmount,
            status: 'done',
            paidAt: paymentResult.approvedAt,
            receiptUrl: paymentResult.receipt?.url,
        })

        return NextResponse.json({
            success: true,
            subscription: {
                id: subscription.id,
                planType: subscription.plan_type,
                status: subscription.status,
                periodEnd: subscription.current_period_end,
            },
            payment: {
                amount: paymentResult.totalAmount,
                receiptUrl: paymentResult.receipt?.url,
            },
        })
    } catch (error: unknown) {
        console.error('[Billing] Issue error:', error)
        const message = error instanceof Error ? error.message : '결제 처리 중 오류가 발생했습니다.'
        await sendErrorAlert({ source: 'billing/issue', error: message })
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
