/**
 * 회원에게 클로버를 선물한다 — 관리자만
 *
 * 대표 지시 2026-09-16 = 「미니린님만 조금 더 늘려줘」
 * 그때까지 이 일을 할 화면이 없어 데이터베이스를 손으로 고쳐야 했다.
 * 리더에게 선물할 일은 앞으로도 생기므로 우리 제품 안에 길을 낸다.
 *
 * 남는 기록 = users.clovers 증가 + credit_transactions 한 줄(누가·얼마·왜).
 * 손으로 고치면 이 기록이 안 남아 나중에 왜 늘었는지 아무도 모른다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** 한 번에 줄 수 있는 최대 — 실수로 0 하나 더 붙이는 것을 막는다 */
const 한번에최대 = 5000

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
    await requireAdmin()

    const { userId } = await params
    const { amount, reason } = await req.json()

    const 줄값 = Number(amount)
    if (!Number.isFinite(줄값) || 줄값 <= 0 || 줄값 > 한번에최대) {
        return NextResponse.json(
            { error: `1에서 ${한번에최대.toLocaleString()} 사이로 넣어주세요.` },
            { status: 400 },
        )
    }

    const admin = createAdminClient()

    const { data: 그사람, error: 조회오류 } = await admin
        .from('users')
        .select('id, email, display_name, clovers')
        .eq('id', userId)
        .maybeSingle()

    if (조회오류 || !그사람) {
        return NextResponse.json({ error: '그 회원을 찾지 못했어요.' }, { status: 404 })
    }

    const 이전 = 그사람.clovers ?? 0
    const 다음 = 이전 + 줄값

    const { error: 저장오류 } = await admin
        .from('users')
        .update({ clovers: 다음 })
        .eq('id', userId)

    if (저장오류) {
        return NextResponse.json({ error: '넣지 못했어요. 잠시 뒤 다시 해주세요.' }, { status: 500 })
    }

    // 왜 늘었는지 남긴다
    await admin.from('credit_transactions').insert({
        user_id: userId,
        amount: 줄값,
        balance_after: 다음,
        type: 'signup_bonus',
        description: `관리자 선물${reason ? ` — ${String(reason).slice(0, 80)}` : ''}`,
    })

    return NextResponse.json({
        ok: true,
        email: 그사람.email,
        name: 그사람.display_name,
        before: 이전,
        after: 다음,
        given: 줄값,
    })
}
