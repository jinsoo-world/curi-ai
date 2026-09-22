// GET    /api/os/knowledge?mentorId=  → 이 봇이 읽은 자료 목록
// POST   /api/os/knowledge            → 자료 넣기 (링크·유튜브·붙여넣은 글)
// DELETE /api/os/knowledge            → 자료 빼기
//
// 🔒 어느 창구든 첫 줄은 「이 봇이 내 팀 봇인가」(team_bots.user_id = 나) 확인이다.
//    서버는 service_role 로 DB 를 만지므로 여기서 안 막으면 남의 봇 자료가 그대로 나간다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    assertBotOwned, assertRoomForMore, listBotSources, addLinkSource, addTextSource, removeBotSource, BotNotMine,
} from '@/domains/os/knowledge'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

function 오류응답(e: unknown) {
    if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
    const message = e instanceof Error ? e.message : '자료를 다루지 못했어요'
    console.error('[os/knowledge]', message)
    return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const mentorId = req.nextUrl.searchParams.get('mentorId') || ''
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        return NextResponse.json({ sources: await listBotSources(db, mentorId) })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function POST(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const kind = String(body.kind ?? '')
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        await assertRoomForMore(db, mentorId)

        if (kind === 'url') {
            const source = await addLinkSource(db, mentorId, String(body.url ?? ''))
            return NextResponse.json({ source: { id: (source as { id: string }).id } })
        }
        if (kind === 'text') {
            const source = await addTextSource(db, mentorId, String(body.title ?? ''), String(body.text ?? ''))
            return NextResponse.json({ source: { id: (source as { id: string }).id } })
        }
        return NextResponse.json({ error: '링크나 글 중 하나를 넣어 주세요' }, { status: 400 })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function DELETE(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const sourceId = String(body.sourceId ?? '')
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        await removeBotSource(db, mentorId, sourceId)
        return NextResponse.json({ ok: true })
    } catch (e) {
        return 오류응답(e)
    }
}
