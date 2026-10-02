// GET  /api/admin/os/inquiries?status=open|answered|closed → 고객센터 문의 목록 (최신순, 최대 200건)
// POST /api/admin/os/inquiries { id, status } → 상태 바꾸기. answered 면 답한 시각을 적는다
// 🔒 관리자만 (기존 requireAdminAPI)
import { NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { INQUIRY_STATUSES, type InquiryStatus } from '@/domains/support/inquiry'

export const dynamic = 'force-dynamic'

const isStatus = (s: unknown): s is InquiryStatus => typeof s === 'string' && (INQUIRY_STATUSES as readonly string[]).includes(s)

export async function GET(req: Request) {
    const auth = await requireAdminAPI()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const status = new URL(req.url).searchParams.get('status')
    let q = createAdminClient().from('support_inquiries')
        .select('id, created_at, user_id, email, category, body, platform, app_version, status, answered_at')
        .order('created_at', { ascending: false })
        .limit(200)
    if (isStatus(status)) q = q.eq('status', status)
    const { data, error } = await q
    if (error) {
        console.error('[admin/os/inquiries GET]', error.message)
        return NextResponse.json({ error: '목록을 못 읽었어요' }, { status: 500 })
    }
    return NextResponse.json({ inquiries: data ?? [] })
}

export async function POST(req: Request) {
    const auth = await requireAdminAPI()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id || !isStatus(body.status)) return NextResponse.json({ error: 'id, status 가 필요해요' }, { status: 400 })
    const patch = { status: body.status, answered_at: body.status === 'answered' ? new Date().toISOString() : undefined }
    const { error } = await createAdminClient().from('support_inquiries').update(patch).eq('id', id)
    if (error) {
        console.error('[admin/os/inquiries POST]', error.message)
        return NextResponse.json({ error: '바꾸지 못했어요' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}
