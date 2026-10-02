// GET  /api/admin/os/reports → 열린 봇 신고, 봇마다 묶음 (발췌, 이유, 수)
// POST /api/admin/os/reports { mentorId, action: 'dismiss' | 'unpublish' | 'keep' } → 조치 (domains/os/reports.handleReports)
// 🔒 관리자만 (requireAdminAPI). 봇 내리기, 다시 공개는 공개 관문(publish-gate)으로만.
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { listOpenReportGroups, handleReports, isMentorId, ReportTableMissing, type ReportAction } from '@/domains/os/reports'

export const dynamic = 'force-dynamic'
export const maxDuration = 60   // 「유지」가 AI 확인을 다시 부를 수 있다

const ACTIONS: ReportAction[] = ['dismiss', 'unpublish', 'keep']

export async function GET() {
    const auth = await requireAdminAPI()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    try {
        return NextResponse.json({ groups: await listOpenReportGroups(createAdminClient()) })
    } catch (e) {
        if (e instanceof ReportTableMissing) return NextResponse.json({ groups: [], tableMissing: true })
        console.error('[admin/os/reports GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '목록을 못 읽었어요' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const auth = await requireAdminAPI()
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error ?? 'Forbidden' }, { status: auth.status || 403 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = ACTIONS.find(a => a === body.action)
    if (!isMentorId(body.mentorId) || !action) return NextResponse.json({ error: 'mentorId, action 이 필요해요' }, { status: 400 })
    try {
        const r = await handleReports(createAdminClient(), auth.user.id, body.mentorId, action)
        if (action !== 'dismiss') { revalidatePath('/os/market'); revalidatePath('/home'); revalidatePath('/mentors') }
        const message = action === 'unpublish' ? `봇을 내렸어요 (신고 ${r.closed}건 조치됨)`
            : action === 'keep' ? (r.note ?? `그대로 둬요 (신고 ${r.closed}건 닫음${r.republished ? ', 다시 공개함' : ''})`)
            : `신고 ${r.closed}건을 닫았어요`
        return NextResponse.json({ ok: true, ...r, message })
    } catch (e) {
        if (e instanceof ReportTableMissing) return NextResponse.json({ error: '신고 표가 아직 없어요' }, { status: 503 })
        const message = e instanceof Error ? e.message : '처리하지 못했어요'
        console.error('[admin/os/reports POST]', message)
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
