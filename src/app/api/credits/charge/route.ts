// /api/credits/charge — 클로버 충전 결제 승인 + 지급
//
// 대표 확정 2026-09-14 「이거 충전식이면 좋을듯해. 클로버 충전 이런거.」
//
// 이 창구가 지켜야 할 것 세 가지
//  ① 금액을 브라우저가 정하지 못하게 한다 — 상품 표에서만 읽는다
//  ② 토스에 실제로 결제됐는지 확인받는다 — 화면 말만 믿지 않는다
//  ③ 같은 결제로 두 번 지급하지 않는다 — 새로고침·재시도로 클로버가 두 배 들어간다
//  ④ 승인 후 지급 전에 끊겨도 다시 시도하면 받는다 — 토스 조회가 DONE 이면 승인을 건너뛰고 지급만 (2026-10-06)
//
// 대표 결정 2026-10-02 「클로버는 없애구」 → 새 주문은 받지 않는다(410).
// 판매 끝 시각(CLOVER_SALES_ENDED_AT) 전에 토스 결제창을 연 주문만 끝까지 승인한다.
// 막을 때는 토스 승인을 부르지 않으므로 돈이 빠져나가지 않는다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { confirmPayment, getPayment } from '@/lib/toss'
import { cloverOrderStartedAt, cloverSaleAllowed, getPack, isValidPackId } from '@/domains/credit/packs'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
        }

        const { paymentKey, orderId, amount, packId } = await req.json()

        if (!paymentKey || !orderId) {
            return NextResponse.json({ error: '결제 정보가 없어요.' }, { status: 400 })
        }
        if (!isValidPackId(packId)) {
            return NextResponse.json({ error: '없는 충전 상품이에요.' }, { status: 400 })
        }

        const pack = getPack(packId)!

        // ① 금액은 우리 표에서 읽는다. 브라우저가 보낸 값과 다르면 멈춘다.
        if (Number(amount) !== pack.won) {
            console.error('[Charge] 금액 불일치:', { 받은값: amount, 우리값: pack.won, packId })
            return NextResponse.json({ error: '결제 금액이 맞지 않아요.' }, { status: 400 })
        }

        const admin = createAdminClient({ longRunning: true })

        // ③ 이미 지급한 결제인지 먼저 본다 (승인 전에 확인해야 재시도에도 안전하다)
        const { data: 이미지급 } = await admin
            .from('credit_transactions')
            .select('id')
            .eq('user_id', user.id)
            .eq('type', 'purchase')
            .eq('description', orderId)
            .maybeSingle()

        if (이미지급) {
            return NextResponse.json({ success: true, alreadyDone: true })
        }

        // 토스에 이 결제를 먼저 묻는다.
        //  · 이미 승인(DONE)된 같은 주문·같은 금액이면 = 앞 요청이 승인 후 지급 전에 끊겼다 → 승인을 건너뛰고 지급만 (다시 승인하면 토스가 거절해 영영 못 받았다)
        //  · 판매가 끝난 뒤에 연 주문이면 승인하지 않는다. 시각은 토스가 적은 값을 믿고, 조회가 안 될 때만 주문번호를 본다
        let 조회: Awaited<ReturnType<typeof getPayment>> | null = null
        try {
            조회 = await getPayment(paymentKey)
        } catch (e) {
            console.error('[Charge] 결제 조회 실패:', e instanceof Error ? e.message : e)
        }
        const 이미승인 = !!조회 && 조회.status === 'DONE' && 조회.orderId === orderId && 조회.totalAmount === pack.won

        let receiptUrl: string | null = 조회?.receipt?.url ?? null
        if (!이미승인) {
            const 연시각 = 조회?.requestedAt ?? cloverOrderStartedAt(orderId)
            if (!cloverSaleAllowed(연시각)) {
                return NextResponse.json({ error: '클로버 판매를 마쳤어요. 결제는 되지 않았어요. 요금제 화면에서 월 요금제를 골라 주세요.' }, { status: 410 })
            }

            // ② 토스에 확인받는다
            const payment = await confirmPayment(paymentKey, orderId, pack.won)
            if (payment.totalAmount !== pack.won) {
                console.error('[Charge] 토스 금액 불일치:', payment.totalAmount, pack.won)
                return NextResponse.json({ error: '결제 금액이 맞지 않아요.' }, { status: 400 })
            }
            receiptUrl = payment.receipt?.url ?? null
        } else {
            console.warn('[Charge] 이미 승인된 결제 — 승인 건너뛰고 지급만:', orderId)
        }

        // 지급 — 기록과 잔액을 DB 함수 하나로 한 번에(주문번호마다 잠금). 같은 주문번호면 null = 이미 지급
        const 지급 = await admin.rpc('grant_clover_purchase', { p_user: user.id, p_order: orderId, p_amount: pack.clovers })
        let 새잔액: number
        if (!지급.error) {
            if (지급.data === null) return NextResponse.json({ success: true, alreadyDone: true })
            새잔액 = 지급.data as number
        } else if (/grant_clover_purchase|PGRST202|42883/.test(`${지급.error.code ?? ''} ${지급.error.message ?? ''}`)) {
            // 함수가 아직 없으면(마이그레이션 전) 예전 두 걸음 방식
            const { data: 새잔액값 } = await admin.rpc('클로버_더하기', { 그사람: user.id, 더할값: pack.clovers })
            if (새잔액값 === null || 새잔액값 < 0) {
                console.error('[Charge] 잔액 반영 실패')
                return NextResponse.json({ error: '잔액 반영에 실패했어요. 고객센터로 알려주세요.' }, { status: 500 })
            }
            새잔액 = 새잔액값 as number
            const { error: txErr } = await admin.from('credit_transactions').insert({
                user_id: user.id,
                amount: pack.clovers,
                balance_after: 새잔액,
                type: 'purchase',
                description: orderId,   // 같은 주문으로 두 번 지급하지 않기 위한 표식
            })
            if (txErr) {
                console.error('[Charge] 기록 실패:', txErr.message)
                return NextResponse.json({ error: '충전 기록에 실패했어요. 고객센터로 알려주세요.' }, { status: 500 })
            }
        } else {
            console.error('[Charge] 지급 실패:', 지급.error.message)
            return NextResponse.json({ error: '잔액 반영에 실패했어요. 잠시 뒤 다시 시도해 주세요.' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            clovers: pack.clovers,
            balance: 새잔액,
            receiptUrl,
        })
    } catch (error) {
        const msg = error instanceof Error ? error.message : '충전에 실패했어요.'
        console.error('[Charge] Error:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
