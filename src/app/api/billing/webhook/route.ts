// /api/billing/webhook — 토스페이먼츠 웹훅 수신
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { eventType, data } = body

        console.log('[Webhook] Received:', eventType, JSON.stringify(data).substring(0, 200))

        // 토스페이먼츠 웹훅 이벤트 처리
        switch (eventType) {
            case 'PAYMENT_STATUS_CHANGED':
                // 결제 상태 변경 시 처리
                console.log('[Webhook] Payment status changed:', data.paymentKey, data.status)
                break

            case 'BILLING_KEY_STATUS_CHANGED':
                // 빌링키 상태 변경 시 처리
                console.log('[Webhook] Billing key status changed:', data.billingKey, data.status)
                break

            default:
                console.log('[Webhook] Unhandled event type:', eventType)
        }

        // 웹훅은 항상 200 OK 반환
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[Webhook] Error:', error)
        // 웹훅은 에러 시에도 200 반환 (재시도 방지)
        return NextResponse.json({ success: true })
    }
}
