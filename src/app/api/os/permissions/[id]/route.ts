// PATCH /api/os/permissions/[id] → 카드에 답한다 (허용 / 거절 / 고쳐서 허용)
//
// 🔒 내 카드이면서 아직 답 안 한 카드만 바뀐다(두 번 누르기·남의 카드 방지. 검사는 domains/agent/permissions).
//    허용해도 여기서 실제로 보내지 않는다. 기록만 남는다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decidePermissionRequest, DECISIONS, PermissionTableMissing } from '@/domains/agent/permissions'
import type { PermissionStatus } from '@/domains/agent/permissions'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const decision = String(body.status ?? body.decision ?? '') as PermissionStatus
    if (!DECISIONS.includes(decision)) {
        return NextResponse.json({ error: '허용·거절·고쳐서 허용 중에서 골라 주세요' }, { status: 400 })
    }
    const decidedPayload = (body.decidedPayload && typeof body.decidedPayload === 'object')
        ? body.decidedPayload as Record<string, unknown>
        : null

    try {
        const card = await decidePermissionRequest(createAdminClient(), user.id, id, decision, decidedPayload)
        if (!card) return NextResponse.json({ error: '이미 답한 카드예요' }, { status: 409 })
        return NextResponse.json({ card })
    } catch (e) {
        if (e instanceof PermissionTableMissing) {
            return NextResponse.json({ error: '승인 카드 표가 아직 준비되지 않았어요', tableMissing: true }, { status: 503 })
        }
        const message = e instanceof Error ? e.message : '답을 저장하지 못했어요'
        console.error('[os/permissions PATCH]', message)
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
