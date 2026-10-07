// PATCH  /api/os/team/[id] → 고정, 숨김, 정렬, 승인 모드, 모양, 색, 한 줄 소개, 역할, 이름, 인사말, 프롬프트, 추가 프롬프트(extraPrompt, 5,000자), 프로필 사진, 공개하기(isPublic) (봇 편집 시트)
//        공개하기는 내가 만든 봇만(마켓에서 데려온 봇, 시연 봇은 403)
//        AI 확인: 막힘 = 422 { code: 'MODERATION_BLOCKED', reasons }, 사람 확인 = 202 { code: 'MODERATION_REVIEW', reasons }.
//        공개 중인 봇의 지시문, 인사말을 고쳐 통과 못 하면 공개가 내려가고 같은 답을 준다(다른 칸은 저장됨, saved: true)
// DELETE /api/os/team/[id] → 팀에서 빼기 (봇의 몸과 대화 기록은 남는다)
//
// 모양/색이 실제로 바뀌면 단톡에 「눈치채기 → 받아치기」 비트를 남긴다 (look-change).
import { parseExtraPrompt } from '@/domains/mentor/extra-prompt'
import { SYSTEM_PROMPT_TOO_LONG, SystemPromptTooLong, systemPromptTooLong } from '@/domains/mentor/system-prompt'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateTeamBot, removeTeamBot, SHAPES, COLORS } from '@/domains/os'
import { BotPublishDenied } from '@/domains/os/team'
import type { TeamBotPatch } from '@/domains/os'
import { classifyLookChange, postLookChangeBeat } from '@/domains/os/look-change'
import { moderationReply } from '@/domains/os/moderation'
import { BotHeld } from '@/domains/os/publish-gate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60   // 공개하기, 공개 중인 봇 고치기는 AI 확인(최대 25초)을 기다린다

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const patch: TeamBotPatch = {}
    if (typeof body.pinned === 'boolean') patch.pinned = body.pinned
    if (typeof body.hidden === 'boolean') patch.hidden = body.hidden
    if (typeof body.sortOrder === 'number') patch.sortOrder = body.sortOrder
    if (['always_ask', 'draft_only', 'auto_safe'].includes(body.approvalMode as string)) patch.approvalMode = body.approvalMode as TeamBotPatch['approvalMode']
    if (SHAPES.includes(body.shape as never)) patch.shape = body.shape as TeamBotPatch['shape']
    if (COLORS.includes(body.color as never)) patch.color = body.color as TeamBotPatch['color']
    if (typeof body.oneLiner === 'string') patch.oneLiner = body.oneLiner.slice(0, 40)
    if (body.role === 'chief' || body.role === 'helper') patch.role = body.role
    if (typeof body.name === 'string') {
        const name = body.name.trim()
        if (!name || name.length > 20) return NextResponse.json({ error: '이름은 1~20자' }, { status: 400 })
        patch.name = name
    }
    if (typeof body.greeting === 'string') patch.greeting = body.greeting.slice(0, 200)
    if (typeof body.systemPrompt === 'string') {
        // 지시문: 30,000자 넘으면 아무것도 안 쓰고 거절(예전엔 12,000자에서 조용히 잘랐다)
        if (systemPromptTooLong(body.systemPrompt)) return NextResponse.json({ error: SYSTEM_PROMPT_TOO_LONG }, { status: 400 })
        patch.systemPrompt = body.systemPrompt
    }
    if (body.extraPrompt !== undefined) {
        // 추가 프롬프트: 5,000자 넘으면 아무것도 안 쓰고 거절(자르지 않는다 = 주인이 모르게 뒷부분이 사라지지 않게)
        const extra = parseExtraPrompt(body.extraPrompt)
        if (!extra.ok) return NextResponse.json({ error: extra.error }, { status: 400 })
        patch.extraPrompt = extra.value
    }
    if (typeof body.avatarUrl === 'string' || body.avatarUrl === null) patch.avatarUrl = body.avatarUrl as string | null
    if (typeof body.isPublic === 'boolean') patch.isPublic = body.isPublic
    try {
        const db = createAdminClient()

        // 비트는 「실제로 달라진」 모양/색만. 같은 값 재전송은 무시.
        let mentorId: string | null = null
        const lookPatch: { shape?: TeamBotPatch['shape']; color?: TeamBotPatch['color'] } = {}
        if (patch.shape !== undefined || patch.color !== undefined) {
            const { data: tb } = await db
                .from('team_bots')
                .select('mentor_id, shape, color')
                .eq('id', id)
                .eq('user_id', user.id)
                .maybeSingle()
            const row = tb as { mentor_id: string; shape: string; color: string } | null
            if (row) {
                mentorId = row.mentor_id
                if (patch.shape !== undefined && patch.shape !== row.shape) lookPatch.shape = patch.shape
                if (patch.color !== undefined && patch.color !== row.color) lookPatch.color = patch.color
            }
        }
        const lookKind = classifyLookChange(lookPatch)

        const { moderation } = await updateTeamBot(db, user.id, id, patch)
        // 공개, 비공개, 마켓 제목이 바뀌면 마켓 목록과 홈 캐시를 바로 비운다 (옛 편집 창구와 같다)
        if (patch.isPublic !== undefined || patch.oneLiner !== undefined || moderation) {
            revalidatePath('/mentors')
            revalidatePath('/home')
        }

        let lookBeat: { channelId: string } | null = null
        if (lookKind && mentorId) {
            try {
                const beat = await postLookChangeBeat(db, {
                    userId: user.id,
                    changedMentorId: mentorId,
                    kind: lookKind,
                })
                if (beat) lookBeat = { channelId: beat.channelId }
            } catch (e) {
                // 비트 실패는 편집 저장을 깨지 않는다
                console.error('[os/team PATCH look-beat]', e instanceof Error ? e.message : e)
            }
        }

        const reply = moderationReply(moderation)
        if (reply) return NextResponse.json({ ...reply.body, saved: true, lookBeat }, { status: reply.status })
        return NextResponse.json({ ok: true, lookBeat, ...(moderation ? { moderation: { verdict: moderation.verdict } } : {}) })
    } catch (e) {
        if (e instanceof BotPublishDenied) return NextResponse.json({ error: e.message }, { status: 403 })
        if (e instanceof BotHeld) return NextResponse.json({ error: e.message, code: 'BOT_HELD' }, { status: 409 })
        if (e instanceof SystemPromptTooLong) return NextResponse.json({ error: e.message }, { status: 400 })
        console.error('[os/team PATCH]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '바꾸지 못했어요' }, { status: 500 })
    }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    try {
        await removeTeamBot(createAdminClient(), user.id, id)
        return NextResponse.json({ ok: true })
    } catch (e) {
        console.error('[os/team DELETE]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '빼지 못했어요' }, { status: 500 })
    }
}
