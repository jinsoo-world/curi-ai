'use client'
// 요금제 첫 달 결제 — 브라우저에서 토스 결제창을 열고, 끝난 뒤 서버(/api/os/plan)에 확인받는 두 걸음.
// 클로버 충전(domains/credit/charge-client.ts)과 같은 모양. 그 파일은 건드리지 않고 요금제용을 따로 둔다.
// 자동 갱신(빌링키)은 심사 전이라 만들지 않는다 = 첫 달만 단건 결제.
import { getPlan, makePlanOrderId, planOrderName, type PaidPlanId, type PlanId } from '@/domains/os/plan'

interface StartArgs {
    /** 로그인한 사람 id. 토스 customerKey 로 쓴다 */
    userId: string
    planId: PaidPlanId
    successUrl: string
    failUrl: string
}

/** 토스 결제창 열기. 금액은 요금제 표에서만 읽는다(브라우저가 정하지 못하게) */
export async function startPlanPayment({ userId, planId, successUrl, failUrl }: StartArgs): Promise<void> {
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
    if (!clientKey) throw new Error('결제 설정이 아직 안 됐어요. 잠시 뒤 다시 시도해 주세요.')
    const plan = getPlan(planId)!

    const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk')
    const tossPayments = await loadTossPayments(clientKey)
    const payment = tossPayments.payment({ customerKey: userId })

    await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: plan.price },
        orderId: makePlanOrderId(planId),
        orderName: planOrderName(planId),
        successUrl,
        failUrl,
        card: { useEscrow: false, flowMode: 'DEFAULT', useCardPoint: false, useAppCardOnly: false },
    })
}

/** 토스가 결제 뒤 돌려보낼 주소 두 개. done 페이지는 ?plan= 으로 클로버 충전과 갈라 본다 */
export function planReturnUrls(origin: string, planId: PaidPlanId) {
    return {
        successUrl: `${origin}/os/charge/done?plan=${encodeURIComponent(planId)}`,
        failUrl: `${origin}/os/charge?failed=1`,
    }
}

export interface PlanConfirmResult {
    plan: PlanId
    expiresAt: string | null
    alreadyDone: boolean
}

/** 결제 뒤 서버에 확인받기. 서버가 토스에 직접 묻고 요금제를 시작한다 */
export async function confirmPlanPayment(params: { paymentKey: string; orderId: string; amount: number; planId: string }): Promise<PlanConfirmResult> {
    const res = await fetch('/api/os/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '요금제를 시작하지 못했어요.')
    return { plan: data.plan ?? 'free', expiresAt: data.expiresAt ?? null, alreadyDone: !!data.alreadyDone }
}

/** 지금 내 요금제 읽기. 실패하면 무료로 본다(화면이 깨지지 않게) */
export async function fetchMyPlan(): Promise<PlanId> {
    try {
        const res = await fetch('/api/os/plan', { cache: 'no-store' })
        if (!res.ok) return 'free'
        const data = await res.json()
        return data.plan === 'basic' || data.plan === 'pro' ? data.plan : 'free'
    } catch {
        return 'free'
    }
}
