'use client'
// 브라우저에서 토스 결제창을 열고, 끝난 뒤 서버에 확인받는 두 걸음.
// 옛 충전 화면(/charge)과 봇 팀 다크 화면(/os/charge)이 똑같이 부른다. 겉만 다르고 속은 하나.
import type { CloverPack } from './packs'
import { makeChargeOrderId } from './charge-flow'

interface StartArgs {
    /** 로그인한 사람 id. 토스 customerKey 로 쓴다 */
    userId: string
    pack: CloverPack
    successUrl: string
    failUrl: string
}

/**
 * 토스 결제창 열기. 금액은 상품 표에서만 읽는다(브라우저가 정하지 못하게).
 * 열쇠가 없으면 던진다 → 화면이 「결제 설정이 아직 안 됐어요」로 보여준다.
 */
export async function startCloverCharge({ userId, pack, successUrl, failUrl }: StartArgs): Promise<void> {
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
    if (!clientKey) throw new Error('결제 설정이 아직 안 됐어요. 잠시 뒤 다시 시도해 주세요.')

    const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk')
    const tossPayments = await loadTossPayments(clientKey)
    const payment = tossPayments.payment({ customerKey: userId })

    await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: pack.won },
        orderId: makeChargeOrderId(pack.id),
        orderName: `클로버 ${pack.clovers.toLocaleString()}개`,
        successUrl,
        failUrl,
        card: { useEscrow: false, flowMode: 'DEFAULT', useCardPoint: false, useAppCardOnly: false },
    })
}

export interface ConfirmResult {
    clovers: number
    balance: number | null
    alreadyDone: boolean
}

/**
 * 결제 뒤 서버에 확인받기. 서버가 토스에 직접 묻고 클로버를 넣는다(화면 말만 믿지 않는다).
 * 실패하면 서버가 준 한국어 문장을 그대로 던진다.
 */
export async function confirmCloverCharge(params: { paymentKey: string; orderId: string; amount: number; packId: string }): Promise<ConfirmResult> {
    const res = await fetch('/api/credits/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '충전에 실패했어요.')
    return {
        clovers: data.clovers ?? 0,
        balance: typeof data.balance === 'number' ? data.balance : null,
        alreadyDone: !!data.alreadyDone,
    }
}
