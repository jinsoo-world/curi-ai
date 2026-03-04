// /api/billing/renew — 정기결제 자동 갱신 (Vercel Cron)
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chargeBilling, generateOrderId } from '@/lib/toss'
import {
    getExpiredSubscriptions,
    renewSubscription,
    savePayment,
    expireSubscription,
    PLANS,
} from '@/domains/subscription'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    // Vercel Cron 인증 (선택)
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    try {
        // 만료된 active 구독 조회
        const expiredSubs = await getExpiredSubscriptions(supabase)
        console.log(`[Cron] Found ${expiredSubs.length} expired subscriptions`)

        const results = {
            renewed: 0,
            expired: 0,
            failed: 0,
        }

        for (const sub of expiredSubs) {
            // canceled 상태면 만료 처리
            if (sub.status === 'canceled') {
                await expireSubscription(supabase, sub.id, sub.user_id)
                results.expired++
                console.log(`[Cron] Expired subscription ${sub.id}`)
                continue
            }

            // active 상태면 자동 갱신 결제 시도
            try {
                const plan = PLANS[sub.plan_type as 'monthly' | 'annual']
                const orderId = generateOrderId(sub.plan_type)

                const paymentResult = await chargeBilling(
                    sub.billing_key,
                    sub.customer_key,
                    plan.price,
                    orderId,
                    `큐리AI ${plan.label} 갱신`,
                )

                // 결제 성공 → 구독 갱신
                await renewSubscription(supabase, sub.id, sub.plan_type as 'monthly' | 'annual')
                await savePayment(supabase, {
                    subscriptionId: sub.id,
                    userId: sub.user_id,
                    tossPaymentKey: paymentResult.paymentKey,
                    tossOrderId: paymentResult.orderId,
                    amount: paymentResult.totalAmount,
                    status: 'done',
                    paidAt: paymentResult.approvedAt,
                    receiptUrl: paymentResult.receipt?.url,
                })

                results.renewed++
                console.log(`[Cron] Renewed subscription ${sub.id}`)
            } catch (error) {
                // 결제 실패 → past_due 상태
                console.error(`[Cron] Failed to renew ${sub.id}:`, error)
                await supabase
                    .from('subscriptions')
                    .update({ status: 'past_due', updated_at: new Date().toISOString() })
                    .eq('id', sub.id)

                results.failed++
            }
        }

        return NextResponse.json({
            success: true,
            results,
            processedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('[Cron] Renew error:', error)
        return NextResponse.json(
            { error: 'Cron 처리 중 오류 발생' },
            { status: 500 },
        )
    }
}
