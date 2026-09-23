// GET    /api/os/audience/groups            → 내 접근 그룹 명단(멤버 포함)
// POST   /api/os/audience/groups             → 그룹 만들기 { name }
// DELETE /api/os/audience/groups?groupId=…   → 그룹 지우기
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AudienceNotOwner, AudienceTableMissing, createGroup, deleteGroup, listMyGroups } from '@/domains/os/audience-db'

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
    console.error('[os/audience/groups]', message)
    return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET() {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    try {
        return NextResponse.json({ groups: await listMyGroups(createAdminClient(), user.id) })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function POST(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as { name?: unknown }
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: '그룹 이름을 써 주세요' }, { status: 400 })
    try {
        return NextResponse.json({ group: await createGroup(createAdminClient(), user.id, name) })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function DELETE(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const groupId = req.nextUrl.searchParams.get('groupId')
    if (!groupId) return NextResponse.json({ error: 'groupId 가 필요해요' }, { status: 400 })
    try {
        await deleteGroup(createAdminClient(), user.id, groupId)
        return NextResponse.json({ ok: true })
    } catch (e) {
        return 오류응답(e)
    }
}
