// /api/billing/issue — 빌링키 발급 + 첫 결제
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { issueBillingKey, chargeBilling, generateOrderId } from '@/lib/toss'
import { createSubscription, savePayment, PLANS } from '@/domains/subscription'
import { sendErrorAlert } from '@/lib/slack'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const { authKey, customerKey, planType, userId } = await req.json()

        if (!authKey || !customerKey || !planType || !userId) {
            return NextResponse.json(
                { error: '필수 파라미터가 누락되었습니다.' },
                { status: 400 },
            )
        }

        if (!['monthly', 'annual'].includes(planType)) {
            return NextResponse.json(
                { error: '잘못된 플랜 타입입니다.' },
                { status: 400 },
            )
        }

        const plan = PLANS[planType as 'monthly' | 'annual']

        // Supabase 서비스 롤 클라이언트 (RLS 우회)
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

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
            planType: planType as 'monthly' | 'annual',
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
