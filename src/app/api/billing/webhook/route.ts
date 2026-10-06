// /api/billing/webhook — 토스페이먼츠 웹훅 수신 + 슬랙 알림
//
// 진짜 토스인지 확인 (lib/toss-webhook.ts 설명):
//  · 결제·취소 상태 웹훅 = 본문의 paymentKey 로 토스 결제 조회를 다시 불러 토스가 알려 준 값만 쓴다(본문 값은 안 믿는다).
//    토스에 없는 결제(404)면 꾸민 요청 → DB·슬랙 손대지 않고 400.
//  · 서명 머리글이 붙어 오면 TOSS_WEBHOOK_SECRET 으로 서명을 검증, 틀리면 401.
//  · 서명도 없고 조회로 확인도 못 하는 기타 이벤트는 기록만(슬랙에 본문을 올리지 않는다 = 아무나 슬랙을 도배하지 못한다).
// 처리 오류는 200 대신 500 = 토스가 다시 보낸다. DB 갱신은 같은 값으로 덮어쓰기라 여러 번 와도 결과가 같다(멱등).
// 슬랙 호출은 3초 마감(웹훅은 10초 안에 답해야 한다).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
    sendSlackNotification,
    buildPaymentStatusMessage,
    buildCancelStatusMessage,
    sendErrorAlert,
} from '@/lib/slack'
import { getPayment, type TossPaymentView } from '@/lib/toss'
import { TOSS_SIGNATURE_HEADER, TOSS_TRANSMISSION_TIME_HEADER, verifyTossSignature } from '@/lib/toss-webhook'

const SLACK_MS = 3_000

/** 토스에 결제를 다시 묻는다. 토스에 없으면 null(꾸민 요청), 그 밖의 실패는 던진다(500 → 토스가 다시 보냄) */
async function verifiedPayment(paymentKey: unknown): Promise<TossPaymentView | null> {
    if (typeof paymentKey !== 'string' || !paymentKey) return null
    try {
        return await getPayment(paymentKey)
    } catch (e) {
        const status = (e as { status?: number }).status
        if (status === 404 || status === 400) return null
        throw e
    }
}

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
        const raw = await req.text()
        let body: { eventType?: string; data?: Record<string, unknown> }
        try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
        const { eventType } = body
        const data = (body.data ?? {}) as Record<string, unknown>

        // 서명이 붙어 왔으면 반드시 맞아야 한다
        const signature = req.headers.get(TOSS_SIGNATURE_HEADER)
        const signed = !!signature
        if (signed && !verifyTossSignature(raw, signature, req.headers.get(TOSS_TRANSMISSION_TIME_HEADER), process.env.TOSS_WEBHOOK_SECRET)) {
            console.warn('[Webhook] 서명 불일치 — 무시', eventType)
            return NextResponse.json({ error: 'bad signature' }, { status: 401 })
        }

        console.log('[Webhook] Received:', eventType, JSON.stringify(data).substring(0, 300))

        const db = getSupabase()

        switch (eventType) {
            // ── 결제 상태 변경 ──
            case 'PAYMENT_STATUS_CHANGED': {
                const payment = await verifiedPayment(data.paymentKey)
                if (!payment) {
                    console.warn('[Webhook] 토스에 없는 결제 — 무시', String(data.paymentKey ?? '').slice(0, 40))
                    return NextResponse.json({ error: 'unknown payment' }, { status: 400 })
                }
                const { paymentKey, orderId, status, totalAmount, method, orderName } = payment

                // 1. DB 업데이트 — payments 테이블에서 해당 결제 상태 동기화 (토스가 알려 준 상태로)
                const statusMap: Record<string, string> = {
                    DONE: 'done',
                    CANCELED: 'canceled',
                    PARTIAL_CANCELED: 'canceled',
                    ABORTED: 'failed',
                    EXPIRED: 'failed',
                }
                const dbStatus = statusMap[status] || 'failed'
                const { error: upErr } = await db
                    .from('payments')
                    .update({ status: dbStatus, updated_at: new Date().toISOString() })
                    .eq('toss_payment_key', paymentKey)
                if (upErr) throw new Error(`payments 갱신 실패: ${upErr.message}`)

                // 2. 결제자 정보 조회
                const payer = await getPayerInfo(db, paymentKey)

                // 3. 슬랙 알림 (결제자 정보 포함)
                const msg = buildPaymentStatusMessage({
                    paymentKey,
                    orderId,
                    status,
                    totalAmount,
                    method: method ?? undefined,
                    orderName: orderName ?? undefined,
                    payer: payer || undefined,
                })
                await sendSlackNotification(msg.text, msg.blocks, { timeoutMs: SLACK_MS })
                break
            }

            // ── 취소 상태 변경 ──
            case 'CANCEL_STATUS_CHANGED': {
                const payment = await verifiedPayment(data.paymentKey)
                if (!payment) {
                    console.warn('[Webhook] 토스에 없는 결제(취소) — 무시')
                    return NextResponse.json({ error: 'unknown payment' }, { status: 400 })
                }
                const cancels = payment.cancels ?? []
                const lastCancel = cancels[cancels.length - 1]

                // 결제자 정보 조회
                const payer = await getPayerInfo(db, payment.paymentKey)

                const msg = buildCancelStatusMessage({
                    paymentKey: payment.paymentKey,
                    orderId: payment.orderId,
                    cancelAmount: lastCancel?.cancelAmount,
                    cancelReason: lastCancel?.cancelReason,
                    payer: payer || undefined,
                })
                await sendSlackNotification(msg.text, msg.blocks, { timeoutMs: SLACK_MS })
                break
            }

            // ── 기타 이벤트 ──
            default: {
                if (!signed) {
                    // 확인할 길이 없는 이벤트 = 기록만 (본문을 슬랙에 올리지 않는다)
                    console.warn('[Webhook] 확인 못 한 이벤트 — 기록만', eventType)
                    break
                }
                await sendSlackNotification(
                    `📌 [토스 웹훅] ${eventType}\n\`\`\`${JSON.stringify(data, null, 2).substring(0, 500)}\`\`\``,
                    undefined,
                    { timeoutMs: SLACK_MS },
                )
            }
        }

        // 웹훅은 10초 이내에 200 OK 반환 필수
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[Webhook] Error:', error)
        const errMsg = error instanceof Error ? error.message : '웹훅 처리 오류'
        await sendErrorAlert({ source: 'billing/webhook', error: errMsg }, { timeoutMs: SLACK_MS })
        // 처리 실패 = 500 → 토스가 다시 보낸다(처리는 같은 값 덮어쓰기라 여러 번 와도 안전)
        return NextResponse.json({ error: '웹훅 처리 오류' }, { status: 500 })
    }
}
