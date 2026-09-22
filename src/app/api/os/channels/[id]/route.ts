// GET   /api/os/channels/[id] → 방 하나 (멤버 + 쌓인 말)
// PATCH /api/os/channels/[id] → 멤버 추가 ({ addMentorIds: [...] })
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getChannel, getChannelBots, listChannelMessages, addChannelMembers, ChannelTableMissing } from '@/domains/os/channels'

export const dynamic = 'force-dynamic'

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    try {
        const db = createAdminClient()
        const channel = await getChannel(db, user.id, id)      // 🔒 남의 방은 null
        if (!channel) return NextResponse.json({ error: '그 방을 못 찾았어요' }, { status: 404 })
        const [members, messages] = await Promise.all([
            getChannelBots(db, user.id, channel.memberMentorIds),
            listChannelMessages(db, user.id, id),
        ])
        return NextResponse.json({ channel, members, messages })
    } catch (e) {
        if (e instanceof ChannelTableMissing) return NextResponse.json({ tableMissing: true }, { status: 503 })
        console.error('[os/channels GET one]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '방을 불러오지 못했어요' }, { status: 500 })
    }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const add = Array.isArray(body.addMentorIds) ? body.addMentorIds.map(String) : []
    if (add.length === 0) return NextResponse.json({ error: '넣을 봇을 골라 주세요' }, { status: 400 })
    try {
        const db = createAdminClient()
        const ids = await addChannelMembers(db, user.id, id, add)
        return NextResponse.json({ members: await getChannelBots(db, user.id, ids) })
    } catch (e) {
        if (e instanceof ChannelTableMissing) return NextResponse.json({ tableMissing: true }, { status: 503 })
        const message = e instanceof Error ? e.message : '멤버를 못 넣었어요'
        console.error('[os/channels PATCH]', message)
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
