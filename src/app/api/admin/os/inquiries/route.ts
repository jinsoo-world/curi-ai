// GET  /api/admin/os/inquiries?status=open|answered|closed → 고객센터 문의 목록 (최신순, 최대 200건)
// POST /api/admin/os/inquiries { id, status } → 상태 바꾸기. answered 면 답한 시각, open 이면 비움. 처리한 관리자(handled_by)를 적는다
// 🔒 관리자만 (기존 requireAdminAPI)
import { NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { INQUIRY_STATUSES, type InquiryStatus } from '@/domains/support/inquiry'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isStatus = (s: unknown): s is InquiryStatus => typeof s === 'string' && (INQUIRY_STATUSES as readonly string[]).includes(s)

export async function GET(req: Request) {
    const auth = await requireAdminAPI()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const status = new URL(req.url).searchParams.get('status')
    let q = createAdminClient().from('support_inquiries')
        .select('id, created_at, user_id, email, category, body, platform, app_version, status, answered_at, handled_by')
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
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error ?? 'Forbidden' }, { status: auth.status || 403 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id : ''
    if (!UUID_RE.test(id) || !isStatus(body.status)) return NextResponse.json({ error: 'id(uuid), status 가 필요해요' }, { status: 400 })
    const patch = {
        status: body.status,
        // 답함 = 지금 시각, 다시 열기 = 비움, 닫음 = 그대로
        ...(body.status === 'answered' ? { answered_at: new Date().toISOString() } : body.status === 'open' ? { answered_at: null } : {}),
        handled_by: auth.user.id,
    }
    const { data, error } = await createAdminClient().from('support_inquiries').update(patch).eq('id', id).select('id')
    if (error) {
        console.error('[admin/os/inquiries POST]', error.message)
        return NextResponse.json({ error: '바꾸지 못했어요' }, { status: 500 })
    }
    if (!data || data.length === 0) return NextResponse.json({ error: '그 문의를 찾지 못했어요' }, { status: 404 })
    return NextResponse.json({ ok: true })
}
