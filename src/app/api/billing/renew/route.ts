// /api/billing/renew — 정기결제 자동 갱신 (Vercel Cron, 하루 한 번)
// 한 바퀴 규칙은 domains/subscription/renew.ts (먼저 잡기 · 정해진 주문번호 · 결제됨+DB실패 구분 · 50건 · 50초).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendErrorAlert } from '@/lib/slack'
import { chargeBilling, getPaymentByOrderId } from '@/lib/toss'
import {
    renewSubscription,
    savePayment,
    expireSubscription,
} from '@/domains/subscription'
import { runRenewals, RENEW_BUDGET_MS, type RenewDeps } from '@/domains/subscription/renew'
import type { Subscription } from '@/domains/subscription'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
    // Vercel Cron 인증 (선택)
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    // 열쇠가 설정돼 있지 않으면 통과시키던 것을 거절로 바꿨다.
    // 그대로 두면 누구나 이 주소를 반복 호출해 전 구독자에게 실제 카드 결제를
    // 여러 번 일으킬 수 있다. 열쇠가 없으면 자동결제를 아예 돌리지 않는 쪽이 안전하다.
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const deadline = Date.now() + RENEW_BUDGET_MS

    const setStatus = async (sub: Subscription, status: Subscription['status']) => {
        const { error } = await supabase.from('subscriptions')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', sub.id).eq('status', 'renewing')
        if (error) throw new Error(error.message)
    }

    const deps: RenewDeps = {
        async listDue(now, limit, staleBefore) {
            // 기간이 끝난 active + 결제 중 죽어 10분 넘게 renewing 으로 남은 줄
            const { data, error } = await supabase.from('subscriptions').select('*')
                .lte('current_period_end', now.toISOString())
                .or(`status.eq.active,and(status.eq.renewing,updated_at.lt."${staleBefore.toISOString()}")`)
                .order('current_period_end', { ascending: true })
                .limit(limit)
            if (error) throw new Error(error.message)
            return (data ?? []) as Subscription[]
        },
        async claim(sub, now) {
            // active → renewing 을 바꾼 쪽만 결제한다. renewing 재잡기는 읽은 그 시각(updated_at)일 때만
            let q = supabase.from('subscriptions').update({ status: 'renewing', updated_at: now.toISOString() }).eq('id', sub.id)
            q = sub.status === 'renewing' ? q.eq('status', 'renewing').eq('updated_at', sub.updated_at) : q.eq('status', 'active')
            const { data, error } = await q.select('id')
            if (error) throw new Error(error.message)
            return (data ?? []).length > 0
        },
        expire: sub => expireSubscription(supabase, sub.id, sub.user_id),
        charge: (sub, amount, orderId, orderName) => chargeBilling(sub.billing_key, sub.customer_key, amount, orderId, orderName),
        lookupOrder: orderId => getPaymentByOrderId(orderId),
        async markRenewed(sub, paid) {
            await savePayment(supabase, {
                subscriptionId: sub.id,
                userId: sub.user_id,
                tossPaymentKey: paid.paymentKey,
                tossOrderId: paid.orderId,
                amount: paid.totalAmount,
                status: 'done',
                paidAt: paid.approvedAt,
                receiptUrl: paid.receipt?.url ?? undefined,
            })
            await renewSubscription(supabase, sub.id, sub.plan_type as 'monthly' | 'annual')
        },
        markPastDue: sub => setStatus(sub, 'past_due'),
        markPaidUnsynced: sub => setStatus(sub, 'renew_paid_unsynced'),
        markNeedsReview: sub => setStatus(sub, 'renew_needs_review'),
        async markCanceled(sub) {
            // 해지 신청 + 결제 안 된 것이 확실 = 결제 없이 canceled (기간은 이미 끝났으니 다음 만료 처리에서 정리)
            const now = new Date().toISOString()
            const { error } = await supabase.from('subscriptions')
                .update({ status: 'canceled', canceled_at: now, updated_at: now })
                .eq('id', sub.id).eq('status', 'renewing')
            if (error) throw new Error(error.message)
        },
        alert: a => sendErrorAlert(a),
    }

    try {
        const results = await runRenewals(deps, { deadline })
        console.log('[Cron] renew', JSON.stringify(results))
        return NextResponse.json({
            success: true,
            results,
            processedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('[Cron] Renew error:', error)
        const errMsg = error instanceof Error ? error.message : 'Cron 처리 중 오류 발생'
        await sendErrorAlert({ source: 'billing/renew-cron', error: errMsg })
        return NextResponse.json(
            { error: 'Cron 처리 중 오류 발생' },
            { status: 500 },
        )
    }
}
