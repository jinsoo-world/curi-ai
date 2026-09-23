// GET /api/os/bots/[mentorId]/response-settings → 이 봇의 답변 설정(병합된 값 + 기본값 kind)
// PUT /api/os/bots/[mentorId]/response-settings → 답변 설정 저장
//
// 🔒 team_bots 로 「이 봇이 내 팀 봇인가」를 먼저 확인한다(assertBotOwned, domains/os/knowledge 재사용).
//    표(bot_response_settings)가 아직 없으면(마이그레이션 전) GET 은 기본값을, PUT 은 503 을 돌려준다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertBotOwned, BotNotMine } from '@/domains/os/knowledge'
import {
    getResponseSettingsForOwner, saveResponseSettings, sanitizeResponseSettingsInput,
    ResponseSettingsTableMissing, type ResponseSettingsInput,
} from '@/domains/os/response-settings'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

function 오류응답(e: unknown) {
    if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
    if (e instanceof ResponseSettingsTableMissing) return NextResponse.json({ error: '답변 설정 기능이 아직 준비 중이에요' }, { status: 503 })
    const message = e instanceof Error ? e.message : '답변 설정을 다루지 못했어요'
    console.error('[os/bots/response-settings]', message)
    return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ mentorId: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { mentorId } = await ctx.params
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        const { data: mentorRow } = await db.from('mentors').select('creator_id').eq('id', mentorId).maybeSingle()
        const { settings, kind } = await getResponseSettingsForOwner(db, mentorId, mentorRow, user.id)
        return NextResponse.json({ settings, kind })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ mentorId: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { mentorId } = await ctx.params
    const body = await req.json().catch(() => ({})) as ResponseSettingsInput
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        const { data: mentorRow } = await db.from('mentors').select('creator_id').eq('id', mentorId).maybeSingle()
        const { kind } = await getResponseSettingsForOwner(db, mentorId, mentorRow, user.id)
        const settings = sanitizeResponseSettingsInput(body, kind)
        await saveResponseSettings(db, mentorId, user.id, settings)
        return NextResponse.json({ settings, kind })
    } catch (e) {
        return 오류응답(e)
    }
}
