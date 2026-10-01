// POST /api/os/twin-draft/create = 주인이 고친 초안으로 봇을 만든다 (역할 twin, 승인은 항상 묻기).
// body { name, oneLiner, greeting, prompt, chips, shape, color, links, pastes }
// 금지선(twin.ts)이 지워졌으면 뒤에 다시 붙인다. 만든 뒤 화면이 /os/chat/{새 봇} 으로 간다.
// 초안이 읽은 링크와 붙여넣은 글은 응답을 보낸 뒤(after) 새 봇의 자료로 넣는다. 자료가 실패해도 봇은 그대로 있다.
import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTeamBot, TeamTableMissing, SHAPES, COLORS } from '@/domains/os'
import type { BotColor, BotShape } from '@/domains/os'
import { ensureHardLimits, cleanDraftLinks, cleanDraftPastes } from '@/domains/os/twin-draft'
import { addDraftSources } from '@/domains/os/knowledge'
import { composeGreeting, learnedLine, tidyLine } from '@/domains/os/twin-draft-shared'

export const dynamic = 'force-dynamic'
export const maxDuration = 120   // 링크 자료 읽기(after)가 링크 하나당 45초까지 걸린다 (초안 창구와 같은 값)

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
    const typed = String(b.greeting ?? '').trim()
    const kinds = (Array.isArray(b.learned) ? b.learned : []).map(String).slice(0, 10)
    const chips = (Array.isArray(b.chips) ? b.chips : []).map(c => tidyLine(c, 30)).filter(Boolean).slice(0, 3)
    const links = cleanDraftLinks(b.links)
    const pastes = cleanDraftPastes(b.pastes)

    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || '주인'
    // 첫 인사: 무엇을 배웠는지 한 줄을 앞에 붙인다 (모델 안 부름)
    const greeting = composeGreeting(learnedLine(String(displayName).slice(0, 20), kinds), typed)
    const db = createAdminClient()
    try {
        const bot = await createTeamBot(db, { id: user.id, displayName }, {
            job: 'custom', customJob: oneLiner || `${displayName}님의 말투로 답장 초안 쓰기`, autonomy: 'always_ask', name, shape, color, role: 'twin',
        }, 'twin_draft')
        const { error } = await db.from('mentors').update({
            system_prompt: ensureHardLimits(prompt),
            ...(greeting ? { greeting_message: greeting } : {}),
            ...(chips.length > 0 ? { sample_questions: chips } : {}),   // 초안 칩이 없으면 만들 때 넣은 첫 칩 3개를 둔다
            ...(oneLiner ? { title: oneLiner, description: oneLiner } : {}),
        }).eq('id', bot.mentorId)
        if (error) console.error('[os/twin-draft/create] 설명 저장 실패', error.message)
        if (links.length > 0 || pastes.length > 0) {
            after(async () => {
                try {
                    const r = await addDraftSources(db, bot.mentorId, { links, pastes, userId: user.id })
                    console.log('[os/twin-draft/create] 자료 넣음', { mentorId: bot.mentorId, ...r })
                } catch (e) {
                    console.error('[os/twin-draft/create] 자료 넣기 실패', e instanceof Error ? e.message : e)
                }
            })
        }
        return NextResponse.json({ bot: { ...bot, greeting: greeting || bot.greeting, oneLiner: oneLiner || bot.oneLiner } })
    } catch (e) {
        if (e instanceof TeamTableMissing) return NextResponse.json({ error: '봇 팀 표가 아직 준비되지 않았어요' }, { status: 503 })
        console.error('[os/twin-draft/create]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '봇을 만들지 못했어요' }, { status: 500 })
    }
}

