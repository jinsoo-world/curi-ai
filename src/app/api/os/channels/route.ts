// GET  /api/os/channels → 내 그룹 채팅방 목록 (멤버 봇 정보까지)
// POST /api/os/channels → 방 만들기 (멤버 = 내 팀 봇 2명 이상)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listChannels, createChannel, getChannelBots, ChannelTableMissing } from '@/domains/os/channels'

export const dynamic = 'force-dynamic'

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function GET() {
    const user = await me()
    if (!user) return NextResponse.json({ channels: [], guest: true })
    try {
        const db = createAdminClient()
        const rooms = await listChannels(db, user.id)
        const withBots = await Promise.all(rooms.map(async r => ({
            ...r,
            members: await getChannelBots(db, user.id, r.memberMentorIds),
        })))
        return NextResponse.json({ channels: withBots })
    } catch (e) {
        if (e instanceof ChannelTableMissing) return NextResponse.json({ channels: [], tableMissing: true })
        console.error('[os/channels GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '그룹방을 불러오지 못했어요' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const name = String(body.name ?? '')
    const mentorIds = Array.isArray(body.mentorIds) ? body.mentorIds.map(String) : []
    try {
        const channel = await createChannel(createAdminClient(), user.id, name, mentorIds)
        return NextResponse.json({ channel })
    } catch (e) {
        if (e instanceof ChannelTableMissing) {
            return NextResponse.json({ error: '그룹 채팅 표가 아직 준비되지 않았어요', tableMissing: true }, { status: 503 })
        }
        const message = e instanceof Error ? e.message : '방을 만들지 못했어요'
        console.error('[os/channels POST]', message)
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
