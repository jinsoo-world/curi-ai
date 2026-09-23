// POST   /api/os/audience/groups/members  → 이메일로 초대 { groupId, email }
// DELETE /api/os/audience/groups/members  → 초대 빼기 { groupId, memberId }
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addGroupMember, AudienceNotOwner, AudienceTableMissing, removeGroupMember } from '@/domains/os/audience-db'

export const dynamic = 'force-dynamic'

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

function 오류응답(e: unknown) {
    if (e instanceof AudienceNotOwner) return NextResponse.json({ error: '내 그룹이 아니에요' }, { status: 403 })
    if (e instanceof AudienceTableMissing) return NextResponse.json({ error: 'Audience 기능이 아직 준비 중이에요', tableMissing: true }, { status: 503 })
    const message = e instanceof Error ? e.message : '처리하지 못했어요'
    console.error('[os/audience/groups/members]', message)
    return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as { groupId?: unknown; email?: unknown }
    const groupId = String(body.groupId ?? '')
    const email = String(body.email ?? '')
    if (!groupId || !email) return NextResponse.json({ error: '그룹과 이메일이 필요해요' }, { status: 400 })
    try {
        return NextResponse.json({ member: await addGroupMember(createAdminClient(), user.id, groupId, email) })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function DELETE(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as { groupId?: unknown; memberId?: unknown }
    const groupId = String(body.groupId ?? '')
    const memberId = String(body.memberId ?? '')
    if (!groupId || !memberId) return NextResponse.json({ error: '그룹과 멤버가 필요해요' }, { status: 400 })
    try {
        await removeGroupMember(createAdminClient(), user.id, groupId, memberId)
        return NextResponse.json({ ok: true })
    } catch (e) {
        return 오류응답(e)
    }
}
