// GET   /api/os/channels/[id] → 방 하나 (멤버 + 쌓인 말)
// PATCH /api/os/channels/[id] → 이름 바꾸기, 멤버 추가/빼기
//   { name } 또는 { addMentorIds } / { removeMentorIds }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    getChannel, getChannelBots, listChannelMessages,
    addChannelMembers, removeChannelMembers, renameChannel, ChannelTableMissing,
} from '@/domains/os/channels'

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
    const nameGiven = Object.prototype.hasOwnProperty.call(body, 'name')
    const add = Array.isArray(body.addMentorIds) ? body.addMentorIds.map(String) : []
    const remove = Array.isArray(body.removeMentorIds) ? body.removeMentorIds.map(String) : []
    if (!nameGiven && add.length === 0 && remove.length === 0) {
        return NextResponse.json({ error: '바꿀 이름이나 넣거나 뺄 봇을 골라 주세요' }, { status: 400 })
    }
    try {
        const db = createAdminClient()
        const 지금 = await getChannel(db, user.id, id)
        if (!지금) return NextResponse.json({ error: '그 방을 못 찾았어요' }, { status: 404 })

        if (nameGiven) {
            const channel = await renameChannel(db, user.id, id, String(body.name ?? ''))
            return NextResponse.json({ channel })
        }

        let ids = 지금.memberMentorIds
        if (add.length > 0) ids = await addChannelMembers(db, user.id, id, add)
        if (remove.length > 0) ids = await removeChannelMembers(db, user.id, id, remove)
        return NextResponse.json({ members: await getChannelBots(db, user.id, ids) })
    } catch (e) {
        if (e instanceof ChannelTableMissing) return NextResponse.json({ tableMissing: true }, { status: 503 })
        const message = e instanceof Error ? e.message : '방을 못 바꿨어요'
        console.error('[os/channels PATCH]', message)
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
