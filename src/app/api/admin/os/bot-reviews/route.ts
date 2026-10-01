// GET  /api/admin/os/bot-reviews → AI 확인에서 「사람이 봐야 함」이 나온 봇 목록 (공개 안 된 것만)
// POST /api/admin/os/bot-reviews { mentorId, decision: 'approve' | 'reject' } → 승인(공개) / 거절
// 🔒 관리자만 (기존 requireAdminAPI). 승인도 확인 대기 중인 봇만 된다(decideBotReview).
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { listPendingReviews } from '@/domains/os/moderation'
import { decideBotReview } from '@/domains/os/team'

export const dynamic = 'force-dynamic'

export async function GET() {
    const auth = await requireAdminAPI()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    try {
        return NextResponse.json({ pending: await listPendingReviews(createAdminClient()) })
    } catch (e) {
        console.error('[admin/os/bot-reviews GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '목록을 못 읽었어요' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const auth = await requireAdminAPI()
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error ?? 'Forbidden' }, { status: auth.status || 403 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const decision = body.decision === 'approve' || body.decision === 'reject' ? body.decision : null
    if (!mentorId || !decision) return NextResponse.json({ error: 'mentorId, decision 이 필요해요' }, { status: 400 })
    try {
        await decideBotReview(createAdminClient(), auth.user.id, mentorId, decision)
        if (decision === 'approve') { revalidatePath('/mentors'); revalidatePath('/home') }
        return NextResponse.json({ ok: true })
    } catch (e) {
        const message = e instanceof Error ? e.message : '처리하지 못했어요'
        console.error('[admin/os/bot-reviews POST]', message)
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
