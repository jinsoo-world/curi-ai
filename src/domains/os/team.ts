// domains/os — 봇 팀 읽기, 쓰기 (서버에서만 부른다. db 는 service_role 이라 user_id 를 여기서 반드시 건다)

import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureCreatorProfile } from '@/domains/creator'
import { buildBotPrompt, buildGreeting, findJob, starterTasksFor, DEFAULT_TEAM } from './presets'
import type { NewBotInput, TeamBot } from './types'
import { recordBotCreated, type BotCreatedPath } from './bot-events'
import { reviewBot, markPendingReview, hasPendingReview, recordReviewDecision, type ModerationResult } from './moderation'

/** 표가 아직 DB 에 없을 때(마이그레이션 미적용) 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다

type Row = {
    id: string; mentor_id: string; role: TeamBot['role']; shape: TeamBot['shape']; color: TeamBot['color']
    one_liner: string | null; approval_mode: TeamBot['approvalMode']; pinned: boolean; hidden: boolean
    sort_order: number; created_at: string; linked_from_market?: boolean | null
    mentors: { name: string; avatar_url: string | null; greeting_message: string; system_prompt: string | null; is_active?: boolean | null; slug?: string | null } | null
}

/** 손님 시연용 봇 이름표. 마켓에서도 빠지고(getActiveMentors) 공개할 수도 없다 */
const DEMO_SLUG_PREFIX = 'os-demo-'

/** 공개하기를 막을 때 (내 봇 아님, 마켓에서 데려온 봇, 시연 봇). 창구는 403 으로 돌려준다 */
export class BotPublishDenied extends Error {
    constructor(reason = '내가 만든 봇만 공개할 수 있어요') { super(reason) }
}

export class TeamTableMissing extends Error {
    constructor() { super('team_bots 표가 아직 없다. supabase/migrations/20260923_agent_os_p0.sql 을 실행해야 한다') }
}

/** 내 팀 명단 (숨긴 봇 포함, 화면이 가른다) */
export async function listTeam(db: SupabaseClient, userId: string): Promise<TeamBot[]> {
    const { data, error } = await db
        .from('team_bots')
        .select('id, mentor_id, role, shape, color, one_liner, approval_mode, pinned, hidden, sort_order, created_at, linked_from_market, mentors(name, avatar_url, greeting_message, system_prompt, is_active, slug)')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) throw new TeamTableMissing()
        throw new Error(error.message)
    }
    const rows = (data ?? []) as unknown as Row[]
    if (rows.length === 0) return []

    // 자료 수는 한 번에 센다
    const mentorIds = rows.map(r => r.mentor_id)
    const { data: counts } = await db
        .from('knowledge_sources')
        .select('mentor_id')
        .in('mentor_id', mentorIds)
    const countMap = new Map<string, number>()
    for (const c of (counts ?? []) as { mentor_id: string }[]) countMap.set(c.mentor_id, (countMap.get(c.mentor_id) ?? 0) + 1)

    return rows.map(r => ({
        id: r.id,
        mentorId: r.mentor_id,
        name: r.mentors?.name ?? '이름 없는 봇',
        role: r.role,
        shape: r.shape,
        color: r.color,
        oneLiner: r.one_liner,
        approvalMode: r.approval_mode,
        pinned: r.pinned,
        hidden: r.hidden,
        sortOrder: r.sort_order,
        avatarUrl: r.mentors?.avatar_url ?? null,
        systemPrompt: r.mentors?.system_prompt ?? '',
        greeting: r.mentors?.greeting_message ?? '',
        knowledgeCount: countMap.get(r.mentor_id) ?? 0,
        createdAt: r.created_at,
        isPublic: !!r.mentors?.is_active,
        canPublish: !r.linked_from_market && !(r.mentors?.slug ?? '').startsWith(DEMO_SLUG_PREFIX),
    }))
}

/**
 * 새 봇 만들기 = mentors 한 줄(봇의 몸) + team_bots 한 줄(팀 소속, 캐릭터).
 * 개인 봇은 공개 목록에 안 뜨게 is_active=false 로 넣는다(공개 목록은 is_active=true 만 뽑는다).
 */
export async function createTeamBot(
    db: SupabaseClient,
    user: { id: string; displayName: string; ownerName?: string },
    input: NewBotInput,
    path: BotCreatedPath = 'os_new_bot',
): Promise<TeamBot> {
    const job = findJob(input.job)
    const creator = await ensureCreatorProfile(db, user.id, user.displayName)
    const slug = `os-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const oneLiner = input.job === 'custom' ? (input.customJob || '').trim().slice(0, 40) : job.oneLiner

    const { data: mentor, error: mErr } = await db
        .from('mentors')
        .insert({
            creator_id: creator.id,
            mentor_type: 'creator',
            status: 'active',
            is_active: false,          // 공개 목록 제외. 주인만 team_bots 로 닿는다
            name: input.name.trim().slice(0, 20),
            slug,
            title: oneLiner || `${user.displayName}님의 봇`,
            description: oneLiner || '',
            expertise: [],
            personality_traits: [],
            system_prompt: buildBotPrompt(input, user.ownerName ?? user.displayName),
            greeting_message: buildGreeting(input),
            sample_questions: starterTasksFor(input.job, input.role),   // 대화방 첫 칩과 같은 3개 (마켓 카드, 정보 카드가 읽는다)
        })
        .select('id, name, avatar_url, greeting_message')
        .single()
    if (mErr || !mentor) throw new Error(mErr?.message ?? '봇의 몸을 만들지 못했다')

    const role = input.role ?? (input.job === 'chief' ? 'chief' : 'helper')
    const { data: tb, error: tErr } = await db
        .from('team_bots')
        .insert({
            user_id: user.id,
            mentor_id: mentor.id,
            role,
            shape: input.shape,
            color: input.color,
            one_liner: oneLiner || null,
            approval_mode: input.autonomy,
        })
        .select('id, role, shape, color, one_liner, approval_mode, pinned, hidden, sort_order, created_at')
        .single()
    if (tErr || !tb) {
        // 팀 줄을 못 만들었으면 몸도 지운다 (반쪽 봇을 남기지 않는다)
        await db.from('mentors').delete().eq('id', mentor.id)
        if ((tErr?.code === TABLE_MISSING || tErr?.code === TABLE_MISSING_REST)) throw new TeamTableMissing()
        throw new Error(tErr?.message ?? '팀에 넣지 못했다')
    }

    await recordBotCreated(db, { path, mentorId: mentor.id, userId: user.id })

    return {
        id: tb.id, mentorId: mentor.id, name: mentor.name, role: tb.role, shape: tb.shape, color: tb.color,
        oneLiner: tb.one_liner, approvalMode: tb.approval_mode, pinned: tb.pinned, hidden: tb.hidden,
        sortOrder: tb.sort_order, avatarUrl: mentor.avatar_url, systemPrompt: '', greeting: mentor.greeting_message,
        knowledgeCount: 0, createdAt: tb.created_at, isPublic: false, canPublish: true,
    }
}

/**
 * 봇 편집. 팀 줄(team_bots)의 칸 = 고정, 숨김, 정렬, 승인 모드, 모양, 색, 한 줄 소개, 역할.
 * 봇의 몸(mentors)에 있는 칸 = 이름, 인사말, 프롬프트, 프로필 사진. 몸은 내가 만든 것(creator_profiles 가 내 것)만 바꾼다 = 리더의 공개 봇 몸은 건드리지 않는다.
 * 한 줄 소개는 마켓이 mentors.title 을 보여 주니, 팀 화면에서 만든 내 봇(slug os-, 시연 os-demo- 제외)이면 몸의 title, description 도 같이 바꾼다.
 * 리더가 /creator 에서 쓴 봇은 제목, 설명이 따로 있으니 팀 줄(one_liner)만 바꾼다.
 * isPublic = 공개하기 / 비공개. 권한 확인(authorizePublish)을 맨 먼저 해서 403 이면 아무 칸도 안 바뀐다.
 * 공개하기를 켜면 AI 확인(moderation.reviewBot)을 거친다: pass = 공개, block = 공개 안 함, review = 공개 안 함 + 확인 대기.
 * 공개 중인 내 봇의 지시문, 인사말을 고치면 다시 확인하고, pass 가 아니면 공개를 내린다.
 * 돌려주는 moderation 은 확인을 했을 때만 있다(창구가 422/202 로 바꿔 준다).
 */
export type TeamBotPatch = Partial<Pick<TeamBot, 'pinned' | 'hidden' | 'sortOrder' | 'approvalMode' | 'shape' | 'color' | 'oneLiner' | 'role' | 'name' | 'greeting' | 'systemPrompt' | 'avatarUrl'>> & { isPublic?: boolean }

export async function updateTeamBot(
    db: SupabaseClient, userId: string, teamBotId: string,
    patch: TeamBotPatch,
): Promise<{ moderation?: ModerationResult }> {
    // 공개 권한부터 본다. 막히면 같이 보낸 다른 칸도 쓰지 않는다(반쪽 저장 없음)
    const publishTarget = patch.isPublic !== undefined ? await authorizePublish(db, userId, teamBotId) : null

    const row: Record<string, unknown> = {}
    if (patch.pinned !== undefined) row.pinned = patch.pinned
    if (patch.hidden !== undefined) row.hidden = patch.hidden
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder
    if (patch.approvalMode !== undefined) row.approval_mode = patch.approvalMode
    if (patch.shape !== undefined) row.shape = patch.shape
    if (patch.color !== undefined) row.color = patch.color
    if (patch.oneLiner !== undefined) row.one_liner = patch.oneLiner
    if (patch.role !== undefined) row.role = patch.role
    if (Object.keys(row).length > 0) {
        const { error } = await db.from('team_bots').update(row).eq('id', teamBotId).eq('user_id', userId)
        if (error) throw new Error(error.message)
    }

    const body: Record<string, unknown> = {}
    if (patch.name !== undefined) body.name = patch.name.trim().slice(0, 20)
    if (patch.greeting !== undefined) body.greeting_message = patch.greeting.trim().slice(0, 200)
    if (patch.systemPrompt !== undefined) body.system_prompt = patch.systemPrompt.slice(0, 12000)
    if (patch.avatarUrl !== undefined) body.avatar_url = patch.avatarUrl
    // 한 줄 소개 → 마켓 제목. 비우면 제목은 그대로 둔다(빈 제목 카드 방지). 내 봇이 아니면 조용히 건너뛴다
    const line = (patch.oneLiner ?? '').trim().slice(0, 40)
    // 공개 중인 봇의 말이 바뀌면 다시 확인한다 (공개하기를 같이 보냈으면 그쪽에서 확인한다)
    const wantsRecheck = patch.isPublic === undefined && (patch.systemPrompt !== undefined || patch.greeting !== undefined)
    let recheck: { mentorId: string; creatorId: string; ownerName: string; botName: string } | null = null

    if (Object.keys(body).length > 0 || line) {
        const { data: tb } = await db.from('team_bots').select('mentor_id').eq('id', teamBotId).eq('user_id', userId).maybeSingle()
        if (!tb) {
            if (Object.keys(body).length > 0) throw new Error('내 팀에 없는 봇이다')
        } else {
            const { data: c } = await db.from('creator_profiles').select('id, display_name').eq('user_id', userId).maybeSingle()
            const creator = c as { id: string; display_name?: string | null } | null
            if (!creator && Object.keys(body).length > 0) throw new Error('내가 만든 봇이 아니다')
            if (creator) {
                // 팀 화면에서 만든 봇만 제목, 설명을 한 줄 소개에 맞춘다. 리더 봇의 긴 설명은 덮지 않는다
                let titleSync: Record<string, unknown> = {}
                type Mine = { slug: string | null; is_active?: boolean | null; name?: string | null }
                let mine: Mine | null = null
                if (line || wantsRecheck) {
                    const { data: m } = await db.from('mentors').select('slug, is_active, name').eq('id', tb.mentor_id).eq('creator_id', creator.id).maybeSingle()
                    mine = m as Mine | null
                    const slug = mine?.slug ?? ''
                    if (line && slug.startsWith('os-') && !slug.startsWith(DEMO_SLUG_PREFIX)) titleSync = { title: line, description: line }
                }
                const next = { ...body, ...titleSync }
                if (Object.keys(next).length > 0) {
                    const { error } = await db.from('mentors').update(next).eq('id', tb.mentor_id).eq('creator_id', creator.id)
                    if (error) throw new Error(error.message)
                }
                if (wantsRecheck && mine?.is_active) {
                    recheck = { mentorId: tb.mentor_id, creatorId: creator.id, ownerName: creator.display_name ?? '', botName: mine.name ?? '' }
                }
            }
        }
    }

    if (publishTarget && patch.isPublic === false) {
        await setTeamBotPublic(db, userId, publishTarget, false)
        return {}
    }
    if (publishTarget && patch.isPublic === true) {
        const moderation = await reviewBot(db, { mentorId: publishTarget.mentorId, userId, ownerName: publishTarget.ownerName })
        if (moderation.verdict === 'pass') await setTeamBotPublic(db, userId, publishTarget, true)
        else if (moderation.verdict === 'review') await markPendingReview(db, { mentorId: publishTarget.mentorId, userId, botName: publishTarget.botName, result: moderation })
        return { moderation }
    }
    if (recheck) {
        // 공개 중인 봇의 말이 바뀌었다 = 다시 확인. 통과 못 하면 공개를 내린다
        const moderation = await reviewBot(db, { mentorId: recheck.mentorId, userId, ownerName: recheck.ownerName })
        if (moderation.verdict !== 'pass') {
            await setTeamBotPublic(db, userId, recheck, false)
            if (moderation.verdict === 'review') await markPendingReview(db, { mentorId: recheck.mentorId, userId, botName: recheck.botName, result: moderation })
        }
        return { moderation }
    }
    return {}
}

/**
 * 공개하기 권한 확인. 내가 만든 봇(mentors.creator_id 가 내 creator_profiles)만. 마켓에서 데려온 봇, 시연 봇은 막는다.
 * 아무것도 쓰지 않는다 = updateTeamBot 이 다른 칸을 쓰기 전에 부른다.
 */
async function authorizePublish(db: SupabaseClient, userId: string, teamBotId: string): Promise<{ mentorId: string; creatorId: string; ownerName: string; botName: string }> {
    const { data: tb } = await db.from('team_bots').select('mentor_id, linked_from_market').eq('id', teamBotId).eq('user_id', userId).maybeSingle()
    const teamRow = tb as { mentor_id: string; linked_from_market: boolean | null } | null
    if (!teamRow) throw new BotPublishDenied('내 팀에 없는 봇이에요')
    if (teamRow.linked_from_market) throw new BotPublishDenied('마켓에서 데려온 봇은 공개할 수 없어요')

    const { data: creator } = await db.from('creator_profiles').select('id, display_name').eq('user_id', userId).maybeSingle()
    const creatorId = (creator as { id: string } | null)?.id
    if (!creatorId) throw new BotPublishDenied()
    const { data: m } = await db.from('mentors').select('id, creator_id, slug, name').eq('id', teamRow.mentor_id).maybeSingle()
    const mentor = m as { id: string; creator_id: string | null; slug: string | null; name?: string | null } | null
    if (!mentor || mentor.creator_id !== creatorId) throw new BotPublishDenied()
    if ((mentor.slug ?? '').startsWith(DEMO_SLUG_PREFIX)) throw new BotPublishDenied('시연용 봇은 공개할 수 없어요')
    return {
        mentorId: mentor.id, creatorId,
        ownerName: (creator as { display_name?: string | null }).display_name ?? '', botName: mentor.name ?? '',
    }
}

/**
 * 공개하기 / 비공개 (권한은 authorizePublish 가 먼저 봤다).
 * 옛 /creator 공개(publishMentor)와 같게: 공개 = is_active=true + status='active', 처음 공개할 때만 mentor_count +1.
 * 비공개 = is_active=false 만 (옛 편집 화면도 status, mentor_count 를 안 건드린다).
 * 두 번 세기 막기(새 칸 없이):
 *   ① 「비공개였던 줄만」 바꾸는 조건부 update → 바뀐 줄이 있을 때만 셈 후보 (동시에 두 번 눌러도 한 번만 통과)
 *   ② app_events 의 os_bot_published 기록으로 「전에 공개한 적」을 본다. 조회가 실패하면 세지 않는다
 *   ③ 기록을 먼저 쓰고, 쓰기에 성공했을 때만 수를 올린다 (두 번 세기보다 덜 세기가 낫다)
 * 공개 목록(getActiveMentors)은 그대로 이 봇을 뽑는다.
 */
async function setTeamBotPublic(db: SupabaseClient, userId: string, target: { mentorId: string; creatorId: string }, isPublic: boolean) {
    const { mentorId, creatorId } = target
    const now = new Date().toISOString()
    if (!isPublic) {
        const { error } = await db.from('mentors').update({ is_active: false, updated_at: now }).eq('id', mentorId).eq('creator_id', creatorId)
        if (error) throw new Error(error.message)
        return
    }

    const { data: flipped, error } = await db.from('mentors')
        .update({ is_active: true, status: 'active', updated_at: now })
        .eq('id', mentorId).eq('creator_id', creatorId).eq('is_active', false)
        .select('id')
    if (error) throw new Error(error.message)
    if (!(flipped as unknown[] | null)?.length) return   // 이미 공개 중 = 셀 것 없음

    // 셈 실패는 공개를 깨지 않는다
    try {
        const { data: seen, error: seenErr } = await db.from('app_events').select('id').eq('name', 'os_bot_published').eq('extra->>mentor_id', mentorId).limit(1)
        if (seenErr) { console.error('[os/team] 공개 기록 조회 실패, 수는 안 올린다', seenErr.message); return }
        if ((seen as unknown[] | null)?.length) return   // 다시 공개 = 세지 않는다
        const { error: insErr } = await db.from('app_events').insert({
            name: 'os_bot_published', tool: 'os_edit_bot', path: null, user_id: userId, anon_id: null,
            extra: { mentor_id: mentorId, user_id: userId },
        })
        if (insErr) { console.error('[os/team] 공개 기록 쓰기 실패, 수는 안 올린다', insErr.message); return }
        await db.rpc('increment_mentor_count', { p_creator_id: creatorId })
    } catch (e) {
        console.error('[os/team] 공개 셈 실패', e instanceof Error ? e.message : e)
    }
}

/**
 * 관리자 결정 (/admin/os/bot-reviews). 확인 대기 중인 봇만 받는다 = 관리자라도 아무 봇이나 공개하지 않는다.
 * 승인 = 주인 공개와 같은 길(setTeamBotPublic: 조건부 바꾸기 + 처음 한 번만 셈). 거절 = 공개 안 함. 둘 다 결정을 기록해 대기를 끝낸다.
 */
export async function decideBotReview(db: SupabaseClient, adminUserId: string, mentorId: string, decision: 'approve' | 'reject'): Promise<void> {
    if (!(await hasPendingReview(db, mentorId))) throw new Error('확인 대기 중인 봇이 아니에요')
    if (decision === 'approve') {
        const { data: m } = await db.from('mentors').select('id, creator_id, slug').eq('id', mentorId).maybeSingle()
        const mentor = m as { id: string; creator_id: string | null; slug: string | null } | null
        if (!mentor?.creator_id) throw new Error('봇을 못 찾았어요')
        if ((mentor.slug ?? '').startsWith(DEMO_SLUG_PREFIX)) throw new Error('시연용 봇은 공개할 수 없어요')
        await setTeamBotPublic(db, adminUserId, { mentorId: mentor.id, creatorId: mentor.creator_id }, true)
    }
    await recordReviewDecision(db, { mentorId, adminUserId, decision })
}

/** 팀에서 뺀다. 봇의 몸(mentors)은 남긴다 — 대화 기록이 걸려 있다. 되돌릴 수 없는 삭제는 카드 뒤에서만(나중) */
export async function removeTeamBot(db: SupabaseClient, userId: string, teamBotId: string) {
    const { error } = await db.from('team_bots').delete().eq('id', teamBotId).eq('user_id', userId)
    if (error) throw new Error(error.message)
}

/** 대화 API 용: 이 사람 팀에 속한 봇이면 몸을 돌려준다(공개 안 된 개인 봇을 주인만 열 수 있게) */
export async function getOwnedTeamBotMentor(db: SupabaseClient, userId: string, mentorId: string) {
    const { data, error } = await db
        .from('team_bots')
        .select('mentor_id, mentors(*)')
        .eq('user_id', userId)
        .eq('mentor_id', mentorId).eq('linked_from_market', false)   // 마켓에서 연동한 봇은 내 봇이 아니다(클로버 규칙 그대로)
        .maybeSingle()
    if (error || !data) return null
    return (data as unknown as { mentors: Record<string, unknown> | null }).mentors
}

/**
 * 처음 팀이 비었으면 기본 봇(DEFAULT_TEAM = 기획팀장, 홍보팀장, 개발팀장, 조사팀장)을 만든다.
 * 봇이 하나라도 있으면(옛 3명 계정 포함) 아무것도 보태지 않고 그대로 돌려준다 = 대표 계정이 헷갈리지 않게.
 * 두 번 눌러도 늘어나지 않게, 만들기 전에 다시 센다.
 */
export async function bootstrapDefaultTeam(
    db: SupabaseClient,
    user: { id: string; displayName: string; ownerName?: string },
): Promise<{ team: TeamBot[]; created: number }> {
    const existing = await listTeam(db, user.id)
    if (existing.length > 0) return { team: existing, created: 0 }
    let created = 0
    for (const d of DEFAULT_TEAM) {
        const job = findJob(d.job)
        await createTeamBot(db, user, { job: d.job, autonomy: 'always_ask', name: d.name, shape: job.shape, color: job.color, role: d.role }, 'onboarding')
        created++
    }
    return { team: await listTeam(db, user.id), created }
}
