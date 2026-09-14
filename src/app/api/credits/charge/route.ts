// /api/credits/charge — 클로버 충전 결제 승인 + 지급
//
// 대표 확정 2026-09-14 「이거 충전식이면 좋을듯해. 클로버 충전 이런거.」
//
// 이 창구가 지켜야 할 것 세 가지
//  ① 금액을 브라우저가 정하지 못하게 한다 — 상품 표에서만 읽는다
//  ② 토스에 실제로 결제됐는지 확인받는다 — 화면 말만 믿지 않는다
//  ③ 같은 결제로 두 번 지급하지 않는다 — 새로고침·재시도로 클로버가 두 배 들어간다
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { confirmPayment } from '@/lib/toss'
import { getPack, isValidPackId } from '@/domains/credit/packs'

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

        const admin = createAdminClient()

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

        // ② 토스에 확인받는다
        const payment = await confirmPayment(paymentKey, orderId, pack.won)
        if (payment.totalAmount !== pack.won) {
            console.error('[Charge] 토스 금액 불일치:', payment.totalAmount, pack.won)
            return NextResponse.json({ error: '결제 금액이 맞지 않아요.' }, { status: 400 })
        }

        // 지급 — 잔액은 DB 에서 더한다(읽고 계산해서 쓰면 동시에 여러 번 눌렀을 때 어긋난다)
        const { data: 현재 } = await admin
            .from('users').select('clovers').eq('id', user.id).single()
        const 이전잔액 = 현재?.clovers ?? 0
        const 새잔액 = 이전잔액 + pack.clovers

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

        const { error: balErr } = await admin
            .from('users').update({ clovers: 새잔액 }).eq('id', user.id)
        if (balErr) {
            console.error('[Charge] 잔액 반영 실패:', balErr.message)
            return NextResponse.json({ error: '잔액 반영에 실패했어요. 고객센터로 알려주세요.' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            clovers: pack.clovers,
            balance: 새잔액,
            receiptUrl: payment.receipt?.url ?? null,
        })
    } catch (error) {
        const msg = error instanceof Error ? error.message : '충전에 실패했어요.'
        console.error('[Charge] Error:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
