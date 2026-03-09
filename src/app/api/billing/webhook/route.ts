// /api/billing/webhook — 토스페이먼츠 웹훅 수신 + 슬랙 알림
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
    sendSlackNotification,
    buildPaymentStatusMessage,
    buildCancelStatusMessage,
    sendErrorAlert,
} from '@/lib/slack'

export const dynamic = 'force-dynamic'

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
}

/**
 * paymentKey로 결제자 정보 조회
 */
async function getPayerInfo(db: ReturnType<typeof getSupabase>, paymentKey: string) {
    try {
        const { data: payment } = await db
            .from('payments')
            .select('user_id, amount, toss_order_id')
            .eq('toss_payment_key', paymentKey)
            .single()

        if (!payment?.user_id) return null

        const { data: user } = await db
            .from('users')
            .select('display_name, email')
            .eq('id', payment.user_id)
            .single()

        return {
            userId: payment.user_id,
            displayName: user?.display_name || '(이름 없음)',
            email: user?.email || '(이메일 없음)',
        }
    } catch {
        return null
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { eventType, data } = body

        console.log('[Webhook] Received:', eventType, JSON.stringify(data).substring(0, 300))

        const db = getSupabase()

        switch (eventType) {
            // ── 결제 상태 변경 ──
            case 'PAYMENT_STATUS_CHANGED': {
                const { paymentKey, orderId, status, totalAmount, method, orderName } = data

                // 1. DB 업데이트 — payments 테이블에서 해당 결제 상태 동기화
                if (paymentKey) {
                    const statusMap: Record<string, string> = {
                        DONE: 'done',
                        CANCELED: 'canceled',
                        PARTIAL_CANCELED: 'canceled',
                        ABORTED: 'failed',
                        EXPIRED: 'failed',
                    }
                    const dbStatus = statusMap[status] || 'failed'

                    await db
                        .from('payments')
                        .update({ status: dbStatus, updated_at: new Date().toISOString() })
                        .eq('toss_payment_key', paymentKey)
                }

                // 2. 결제자 정보 조회
                const payer = paymentKey ? await getPayerInfo(db, paymentKey) : null

                // 3. 슬랙 알림 (결제자 정보 포함)
                const msg = buildPaymentStatusMessage({
                    paymentKey,
                    orderId,
                    status,
                    totalAmount,
                    method,
                    orderName,
                    payer: payer || undefined,
                })
                await sendSlackNotification(msg.text, msg.blocks)
                break
            }

            // ── 취소 상태 변경 ──
            case 'CANCEL_STATUS_CHANGED': {
                const { paymentKey, orderId, cancels } = data
                const lastCancel = cancels?.[cancels.length - 1]

                // 결제자 정보 조회
                const payer = paymentKey ? await getPayerInfo(db, paymentKey) : null

                const msg = buildCancelStatusMessage({
                    paymentKey,
                    orderId,
                    cancelAmount: lastCancel?.cancelAmount,
                    cancelReason: lastCancel?.cancelReason,
                    payer: payer || undefined,
                })
                await sendSlackNotification(msg.text, msg.blocks)
                break
            }

            // ── 기타 이벤트 ──
            default: {
                await sendSlackNotification(
                    `📌 [토스 웹훅] ${eventType}\n\`\`\`${JSON.stringify(data, null, 2).substring(0, 500)}\`\`\``
                )
            }
        }

        // 웹훅은 10초 이내에 200 OK 반환 필수
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[Webhook] Error:', error)
        const errMsg = error instanceof Error ? error.message : '웹훅 처리 오류'
        await sendErrorAlert({ source: 'billing/webhook', error: errMsg })
        // 에러 시에도 200 반환 (토스 재전송 방지가 필요한 경우)
        return NextResponse.json({ success: true })
    }
}
