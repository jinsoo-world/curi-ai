'use client'
// 클로버 충전 결제 뒤 서버에 확인받는 걸음.
// 대표 결정 1002 「클로버는 없애구」 → 결제창을 여는 쪽(startCloverCharge)은 지웠다. 새 클로버 주문은 없다.
// 확인 쪽만 남긴 것은 판매가 끝나기 전에 결제창을 연 주문이 결제 뒤 돌아오는 자리(/charge/done, /os/charge/done)에서 끝까지 받게 하려는 것이다.

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
