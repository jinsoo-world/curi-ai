// GET  /api/admin/os/bot-reviews → AI 확인에서 「사람이 봐야 함」이 나온 봇 목록 (공개 안 된 것만)
// POST /api/admin/os/bot-reviews { mentorId, decision: 'approve' | 'reject' } → 승인(공개) / 거절
// 🔒 관리자만 (기존 requireAdminAPI). 열린 확인 대기만 된다(publish-gate.decideReview). 이미 닫힌 대기 = 409.
// 승인했는데 대기 뒤 내용이 바뀌었으면 공개하지 않고 AI 가 다시 본다(status: 'rereviewed').
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { listPendingReviews } from '@/domains/os/moderation'
import { decideReview, ReviewNotPending } from '@/domains/os/publish-gate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60   // 내용이 바뀐 대기를 승인하면 AI 확인을 다시 기다린다

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
        const r = await decideReview(createAdminClient(), auth.user.id, mentorId, decision)
        if (decision === 'approve') { revalidatePath('/mentors'); revalidatePath('/home') }
        const message = r.status === 'approved' ? '공개했어요'
            : r.status === 'rejected' ? '거절했어요'
            : `확인 뒤 내용이 바뀌어 AI 가 다시 봤어요: ${r.moderation?.verdict === 'pass' ? '통과, 공개했어요' : r.moderation?.verdict === 'block' ? '막힘, 공개 안 함' : '다시 확인 대기'}`
        return NextResponse.json({ ok: true, status: r.status, message })
    } catch (e) {
        if (e instanceof ReviewNotPending) return NextResponse.json({ error: e.message }, { status: 409 })
        const message = e instanceof Error ? e.message : '처리하지 못했어요'
        console.error('[admin/os/bot-reviews POST]', message)
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
