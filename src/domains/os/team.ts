// domains/os — 봇 팀 읽기, 쓰기 (서버에서만 부른다. db 는 service_role 이라 user_id 를 여기서 반드시 건다)

import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureCreatorProfile } from '@/domains/creator'
import { buildBotPrompt, buildGreeting, findJob, starterTasksFor, DEFAULT_TEAM } from './presets'
import type { NewBotInput, TeamBot } from './types'
import { recordBotCreated, type BotCreatedPath } from './bot-events'

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
 * 한 줄 소개는 마켓이 mentors.title 을 보여 주니 내 봇이면 몸의 title, description 도 같이 바꾼다(남의 봇이면 팀 줄만).
 * isPublic = 공개하기 / 비공개 (setTeamBotPublic).
 */
export type TeamBotPatch = Partial<Pick<TeamBot, 'pinned' | 'hidden' | 'sortOrder' | 'approvalMode' | 'shape' | 'color' | 'oneLiner' | 'role' | 'name' | 'greeting' | 'systemPrompt' | 'avatarUrl'>> & { isPublic?: boolean }

export async function updateTeamBot(
    db: SupabaseClient, userId: string, teamBotId: string,
    patch: TeamBotPatch,
) {
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
    const titleSync: Record<string, unknown> = line ? { title: line, description: line } : {}

    if (Object.keys(body).length > 0 || Object.keys(titleSync).length > 0) {
        const { data: tb } = await db.from('team_bots').select('mentor_id').eq('id', teamBotId).eq('user_id', userId).maybeSingle()
        if (!tb) {
            if (Object.keys(body).length > 0) throw new Error('내 팀에 없는 봇이다')
        } else {
            const { data: creator } = await db.from('creator_profiles').select('id').eq('user_id', userId).maybeSingle()
            if (!creator && Object.keys(body).length > 0) throw new Error('내가 만든 봇이 아니다')
            if (creator) {
                const { error } = await db.from('mentors').update({ ...body, ...titleSync }).eq('id', tb.mentor_id).eq('creator_id', creator.id)
                if (error) throw new Error(error.message)
            }
        }
    }

    if (patch.isPublic !== undefined) await setTeamBotPublic(db, userId, teamBotId, patch.isPublic)
}

/**
 * 공개하기 / 비공개. 내가 만든 봇(mentors.creator_id 가 내 creator_profiles)만. 마켓에서 데려온 봇, 시연 봇은 막는다.
 * 옛 /creator 공개(publishMentor)와 같게: 공개 = is_active=true + status='active', 처음 공개할 때만 mentor_count +1.
 * 비공개 = is_active=false 만 (옛 편집 화면도 status, mentor_count 를 안 건드린다).
 * 「처음」 판정은 app_events 의 os_bot_published 기록으로 한다(새 칸 없이). 공개 목록(getActiveMentors)은 그대로 이 봇을 뽑는다.
 */
async function setTeamBotPublic(db: SupabaseClient, userId: string, teamBotId: string, isPublic: boolean) {
    const { data: tb } = await db.from('team_bots').select('mentor_id, linked_from_market').eq('id', teamBotId).eq('user_id', userId).maybeSingle()
    const teamRow = tb as { mentor_id: string; linked_from_market: boolean | null } | null
    if (!teamRow) throw new BotPublishDenied('내 팀에 없는 봇이에요')
    if (teamRow.linked_from_market) throw new BotPublishDenied('마켓에서 데려온 봇은 공개할 수 없어요')

    const { data: creator } = await db.from('creator_profiles').select('id').eq('user_id', userId).maybeSingle()
    const creatorId = (creator as { id: string } | null)?.id
    if (!creatorId) throw new BotPublishDenied()
    const { data: m } = await db.from('mentors').select('id, creator_id, slug, is_active').eq('id', teamRow.mentor_id).maybeSingle()
    const mentor = m as { id: string; creator_id: string | null; slug: string | null; is_active: boolean | null } | null
    if (!mentor || mentor.creator_id !== creatorId) throw new BotPublishDenied()
    if ((mentor.slug ?? '').startsWith(DEMO_SLUG_PREFIX)) throw new BotPublishDenied('시연용 봇은 공개할 수 없어요')

    const next: Record<string, unknown> = { is_active: isPublic, updated_at: new Date().toISOString() }
    if (isPublic) next.status = 'active'
    const { error } = await db.from('mentors').update(next).eq('id', mentor.id).eq('creator_id', creatorId)
    if (error) throw new Error(error.message)
    if (!isPublic || mentor.is_active) return

    // 처음 공개일 때만 크리에이터 봇 수 +1 (다시 공개는 세지 않는다). 기록, 셈 실패는 공개를 깨지 않는다
    try {
        const { data: seen } = await db.from('app_events').select('id').eq('name', 'os_bot_published').eq('extra->>mentor_id', mentor.id).limit(1)
        if ((seen as unknown[] | null)?.length) return
        await db.rpc('increment_mentor_count', { p_creator_id: creatorId })
        await db.from('app_events').insert({
            name: 'os_bot_published', tool: 'os_edit_bot', path: null, user_id: userId, anon_id: null,
            extra: { mentor_id: mentor.id, user_id: userId },
        })
    } catch (e) {
        console.error('[os/team] 공개 기록 실패', e instanceof Error ? e.message : e)
    }
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
