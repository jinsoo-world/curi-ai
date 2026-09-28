// POST /api/os/twin-draft/create = 주인이 고친 초안으로 봇을 만든다 (역할 twin, 승인은 항상 묻기).
// body { name, oneLiner, greeting, prompt, chips, shape, color }
// 금지선(twin.ts)이 지워졌으면 뒤에 다시 붙인다. 만든 뒤 화면이 /os/chat/{새 봇} 으로 간다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTeamBot, TeamTableMissing, SHAPES, COLORS } from '@/domains/os'
import type { BotColor, BotShape } from '@/domains/os'
import { ensureHardLimits } from '@/domains/os/twin-draft'
import { tidyLine } from '@/domains/os/twin-draft-shared'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const name = String(b.name ?? '').trim()
    if (!name || name.length > 20) return NextResponse.json({ error: '이름은 1~20자' }, { status: 400 })
    const prompt = String(b.prompt ?? '').trim()
    if (prompt.length < 20) return NextResponse.json({ error: '봇 설명이 비어 있어요' }, { status: 400 })
    const shape = (SHAPES as readonly string[]).includes(String(b.shape)) ? b.shape as BotShape : 'circle'
    const color = (COLORS as readonly string[]).includes(String(b.color)) ? b.color as BotColor : 'orange'
    const oneLiner = tidyLine(b.oneLiner, 40)
    const greeting = String(b.greeting ?? '').trim().slice(0, 200)
    const chips = (Array.isArray(b.chips) ? b.chips : []).map(c => tidyLine(c, 30)).filter(Boolean).slice(0, 3)

    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || '주인'
    const db = createAdminClient()
    try {
        const bot = await createTeamBot(db, { id: user.id, displayName }, {
            job: 'custom', customJob: oneLiner || `${displayName}님의 말투로 답장 초안 쓰기`, autonomy: 'always_ask', name, shape, color, role: 'twin',
        })
        const { error } = await db.from('mentors').update({
            system_prompt: ensureHardLimits(prompt),
            ...(greeting ? { greeting_message: greeting } : {}),
            sample_questions: chips,
            ...(oneLiner ? { title: oneLiner, description: oneLiner } : {}),
        }).eq('id', bot.mentorId)
        if (error) console.error('[os/twin-draft/create] 설명 저장 실패', error.message)
        return NextResponse.json({ bot: { ...bot, greeting: greeting || bot.greeting, oneLiner: oneLiner || bot.oneLiner } })
    } catch (e) {
        if (e instanceof TeamTableMissing) return NextResponse.json({ error: '봇 팀 표가 아직 준비되지 않았어요' }, { status: 503 })
        console.error('[os/twin-draft/create]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '봇을 만들지 못했어요' }, { status: 500 })
    }
}
