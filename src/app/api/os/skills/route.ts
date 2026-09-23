// GET    /api/os/skills → 내 스킬 목록(본문은 안 보낸다, 글자 수만)
// POST   /api/os/skills → 깃허브 주소로 스킬 가져오기 { url }
// PATCH  /api/os/skills → 켜기/끄기, 붙일 봇 { id, enabled?, mentorIds? }
// DELETE /api/os/skills → 지우기 { id }
//
// 🔒 첫 줄은 「로그인했나」, 모든 DB 질의에 user_id 를 건다.
// 🌐 서버가 밖으로 나가는 곳은 raw.githubusercontent.com 하나(domains/os/skills.ts 가 막는다).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import {
    SkillFetchFailed, SkillNotMine, SkillTableMissing, addSkill, deleteSkill, fetchSkillText,
    listSkills, parseGithubUrl, skillNameFrom, updateSkill,
} from '@/domains/os/skills'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

function 오류응답(e: unknown) {
    if (e instanceof SkillNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
    if (e instanceof SkillTableMissing) return NextResponse.json({ error: '스킬 기능이 아직 준비 중이에요' }, { status: 503 })
    if (e instanceof SkillFetchFailed) return NextResponse.json({ error: e.message }, { status: 400 })
    const message = e instanceof Error ? e.message : '스킬을 다루지 못했어요'
    console.error('[os/skills]', message)
    return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET() {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    try {
        return NextResponse.json({ skills: await listSkills(createAdminClient(), user.id) })
    } catch (e) { return 오류응답(e) }
}

export async function POST(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('skill-add', user.id, null, req), 10, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('스킬 가져오기') }, { status: 429 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const url = String(body.url ?? '').trim()
    const g = parseGithubUrl(url)
    if (!g) return NextResponse.json({ error: 'github.com 주소만 받아요. 예: https://github.com/이름/저장소 또는 …/tree/main/skills/이름' }, { status: 400 })

    try {
        const { text, url: rawUrl } = await fetchSkillText(g)
        const skill = await addSkill(db, user.id, { name: skillNameFrom(text, g), sourceUrl: url, content: text })
        return NextResponse.json({ skill, from: rawUrl.endsWith('/SKILL.md') ? 'SKILL.md' : rawUrl.split('/').pop() })
    } catch (e) { return 오류응답(e) }
}

export async function PATCH(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorIds = Array.isArray(body.mentorIds) ? body.mentorIds.filter((x): x is string => typeof x === 'string') : undefined
    try {
        await updateSkill(createAdminClient(), user.id, String(body.id ?? ''), {
            enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
            mentorIds,
        })
        return NextResponse.json({ ok: true })
    } catch (e) { return 오류응답(e) }
}

export async function DELETE(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    try {
        await deleteSkill(createAdminClient(), user.id, String(body.id ?? ''))
        return NextResponse.json({ ok: true })
    } catch (e) { return 오류응답(e) }
}
