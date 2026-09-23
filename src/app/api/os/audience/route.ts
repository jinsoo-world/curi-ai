// GET /api/os/audience?mentorId=…  → 이 봇의 Audience 설정 + 내 접근 그룹 + 이 봇에 붙은 그룹
// POST /api/os/audience            → 설정 저장 { mentorId, level, messageLimitPerWeek, voiceMinutesPerWeek, groupIds }
//
// 🔒 어느 창구든 첫 줄은 「로그인했나」, 그다음은 「이 봇의 주인이 맞나」(resolveMentorOwnerId).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAudienceLevel } from '@/domains/os/audience'
import {
    AudienceNotOwner, AudienceTableMissing, getAudienceSettings, listBotGroupIds, listMyGroups,
    resolveMentorOwnerId, saveAudienceSettings, setBotGroups,
} from '@/domains/os/audience-db'

export const dynamic = 'force-dynamic'

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

function 오류응답(e: unknown) {
    if (e instanceof AudienceNotOwner) return NextResponse.json({ error: '이 봇의 주인이 아니에요' }, { status: 403 })
    if (e instanceof AudienceTableMissing) return NextResponse.json({ error: 'Audience 기능이 아직 준비 중이에요(관리자에게 알려 주세요)', tableMissing: true }, { status: 503 })
    const message = e instanceof Error ? e.message : '처리하지 못했어요'
    console.error('[os/audience]', message)
    return NextResponse.json({ error: message }, { status: 400 })
}

async function findMentor(db: ReturnType<typeof createAdminClient>, mentorId: string) {
    const { data } = await db.from('mentors').select('id, is_active, creator_id').eq('id', mentorId).maybeSingle()
    return data as { id: string; is_active: boolean | null; creator_id: string | null } | null
}

export async function GET(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const mentorId = req.nextUrl.searchParams.get('mentorId')
    if (!mentorId) return NextResponse.json({ error: 'mentorId 가 필요해요' }, { status: 400 })

    const db = createAdminClient()
    try {
        const mentor = await findMentor(db, mentorId)
        if (!mentor) return NextResponse.json({ error: '봇을 찾을 수 없어요' }, { status: 404 })
        const ownerId = await resolveMentorOwnerId(db, mentor)
        if (ownerId !== user.id) return NextResponse.json({ error: '이 봇의 주인이 아니에요' }, { status: 403 })

        const [settings, groups, selectedGroupIds] = await Promise.all([
            getAudienceSettings(db, mentor),
            listMyGroups(db, user.id),
            listBotGroupIds(db, mentorId),
        ])
        return NextResponse.json({ ...settings, groups, selectedGroupIds })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function POST(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    if (!mentorId) return NextResponse.json({ error: 'mentorId 가 필요해요' }, { status: 400 })
    const level = body.level
    if (!isAudienceLevel(level)) return NextResponse.json({ error: '공개 범위를 골라 주세요' }, { status: 400 })
    const groupIds = Array.isArray(body.groupIds) ? body.groupIds.map(String) : []

    const db = createAdminClient()
    try {
        const mentor = await findMentor(db, mentorId)
        if (!mentor) return NextResponse.json({ error: '봇을 찾을 수 없어요' }, { status: 404 })
        const ownerId = await resolveMentorOwnerId(db, mentor)
        if (ownerId !== user.id) return NextResponse.json({ error: '이 봇의 주인이 아니에요' }, { status: 403 })

        await saveAudienceSettings(db, mentorId, user.id, {
            level,
            messageLimitPerWeek: body.messageLimitPerWeek,
            voiceMinutesPerWeek: body.voiceMinutesPerWeek,
        })
        await setBotGroups(db, user.id, mentorId, groupIds)
        return NextResponse.json({ ok: true })
    } catch (e) {
        return 오류응답(e)
    }
}
