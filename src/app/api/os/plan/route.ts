// /api/os/plan — 내 요금제
//   GET  → { plan, expiresAt, limits }  (행이 없거나 표가 아직 없으면 free)
//   POST → 첫 달 결제 승인 + 요금제 시작. { paymentKey, orderId, amount, planId }
//
// 대표 확정 0923: 무료 / 베이직 월 29,000원 / 프로 월 99,000원. 자동 갱신(빌링키)은 심사 전이라 아직 없다.
//
// POST 가 지켜야 할 것 세 가지 (/api/credits/charge 와 같은 원칙)
//  ① 금액을 브라우저가 정하지 못하게 한다 — 요금제 표(plan.ts)에서만 읽는다
//  ② 토스에 실제로 결제됐는지 확인받는다 — 화면 말만 믿지 않는다
//  ③ 같은 결제로 두 번 반영하지 않는다 — user_plans.last_order_id 로 막는다
// 쓰기는 여기(service_role)에서만. 클로버 지급(credit_transactions)은 건드리지 않는다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { confirmPayment } from '@/lib/toss'
import { isTableMissing } from '@/domains/os/admin-stats'
import { getPlan, isPaidPlanId, planExpiresAt, planIdFromOrderId, planLimits, resolvePlan } from '@/domains/os/plan'

export const dynamic = 'force-dynamic'

const FREE = { plan: 'free' as const, expiresAt: null, limits: planLimits('free') }

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ guest: true, ...FREE })
    try {
        const { data, error } = await createAdminClient()
            .from('user_plans')
            .select('plan, expires_at')
            .eq('user_id', user.id)
            .maybeSingle()
        // 표가 아직 없어도(42P01) 화면은 깨지지 않는다 = 무료로 본다
        if (error) {
            if (!isTableMissing(error)) console.error('[os/plan] 읽기 실패:', error.message)
            return NextResponse.json(FREE)
        }
        const r = resolvePlan(data)
        return NextResponse.json({ ...r, limits: planLimits(r.plan) })
    } catch (e) {
        console.error('[os/plan]', e instanceof Error ? e.message : e)
        return NextResponse.json(FREE)
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })

        const { paymentKey, orderId, amount, planId } = await req.json()
        if (!paymentKey || !orderId) return NextResponse.json({ error: '결제 정보가 없어요.' }, { status: 400 })
        if (!isPaidPlanId(planId)) return NextResponse.json({ error: '없는 요금제예요.' }, { status: 400 })
        // 주문번호 접두사(plan_basic_)와 요금제가 다르면 멈춘다. 클로버 주문(clover_…)이 여기로 오면 여기서 걸린다
        if (planIdFromOrderId(orderId) !== planId) return NextResponse.json({ error: '주문 정보가 맞지 않아요.' }, { status: 400 })

        const plan = getPlan(planId)!

        // ① 금액은 우리 표에서 읽는다
        if (Number(amount) !== plan.price) {
            console.error('[os/plan] 금액 불일치:', { 받은값: amount, 우리값: plan.price, planId })
            return NextResponse.json({ error: '결제 금액이 맞지 않아요.' }, { status: 400 })
        }

        const admin = createAdminClient()

        // ③ 이미 반영한 결제인지 먼저 본다. 표가 없으면 돈을 받기 전에 멈춘다(승인 뒤 저장 실패가 더 나쁘다)
        const { data: 기존, error: 읽기오류 } = await admin
            .from('user_plans')
            .select('plan, expires_at, last_order_id')
            .eq('user_id', user.id)
            .maybeSingle()
        if (읽기오류) {
            console.error('[os/plan] 읽기 실패:', 읽기오류.message)
            const msg = isTableMissing(읽기오류) ? '요금제 저장 준비가 아직 안 됐어요. 결제는 되지 않았어요.' : '요금제를 읽지 못했어요. 결제는 되지 않았어요.'
            return NextResponse.json({ error: msg }, { status: 503 })
        }
        if (기존?.last_order_id === orderId) {
            const r = resolvePlan(기존)
            return NextResponse.json({ success: true, alreadyDone: true, ...r })
        }

        // ② 토스에 확인받는다
        const payment = await confirmPayment(paymentKey, orderId, plan.price)
        if (payment.totalAmount !== plan.price) {
            console.error('[os/plan] 토스 금액 불일치:', payment.totalAmount, plan.price)
            return NextResponse.json({ error: '결제 금액이 맞지 않아요.' }, { status: 400 })
        }

        // 요금제 시작. 첫 달만 결제되므로 끝나는 날 = 한 달 뒤
        const now = new Date()
        const expiresAt = planExpiresAt(now)
        const { error: 쓰기오류 } = await admin.from('user_plans').upsert({
            user_id: user.id,
            plan: planId,
            started_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            last_order_id: orderId,
            updated_at: now.toISOString(),
        }, { onConflict: 'user_id' })
        if (쓰기오류) {
            console.error('[os/plan] 저장 실패:', 쓰기오류.message, { orderId })
            return NextResponse.json({ error: '결제는 됐는데 요금제 저장에 실패했어요. 고객센터로 알려주세요.' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            plan: planId,
            expiresAt: expiresAt.toISOString(),
            receiptUrl: payment.receipt?.url ?? null,
        })
    } catch (error) {
        const msg = error instanceof Error ? error.message : '결제 승인에 실패했어요.'
        console.error('[os/plan] Error:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
