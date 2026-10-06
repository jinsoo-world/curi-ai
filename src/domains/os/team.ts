// domains/os — 봇 팀 읽기, 쓰기 (서버에서만 부른다. db 는 service_role 이라 user_id 를 여기서 반드시 건다)

import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureCreatorProfile } from '@/domains/creator'
import { buildBotPrompt, buildGreeting, findJob, starterTasksFor, DEFAULT_TEAM } from './presets'
import type { NewBotInput, TeamBot } from './types'
import { recordBotCreated, type BotCreatedPath } from './bot-events'
import type { ModerationResult } from './moderation'
import { applyBotEdit } from './publish-gate'

/** 표가 아직 DB 에 없을 때(마이그레이션 미적용) 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다

type Row = {
    id: string; mentor_id: string; role: TeamBot['role']; shape: TeamBot['shape']; color: TeamBot['color']
    one_liner: string | null; approval_mode: TeamBot['approvalMode']; pinned: boolean; hidden: boolean
    sort_order: number; created_at: string; linked_from_market?: boolean | null
    mentors: { name: string; avatar_url: string | null; greeting_message: string; system_prompt: string | null; is_active?: boolean | null; slug?: string | null; creator_id?: string | null } | null
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
        .select('id, mentor_id, role, shape, color, one_liner, approval_mode, pinned, hidden, sort_order, created_at, linked_from_market, mentors(name, avatar_url, greeting_message, system_prompt, is_active, slug, creator_id)')
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

    // 🔒 지시문은 내가 만든 봇만 싣는다. 마켓에서 데려온 남의 봇은 빈 글(지시문 유출 방지)
    //    크리에이터 프로필이 여러 줄인 사람도 있다(옛 중복). maybeSingle 은 그때 오류로 비어 내 봇 지시문까지 사라졌다
    const { data: myCreators } = await db.from('creator_profiles').select('id').eq('user_id', userId)
    const myCreatorIds = new Set(((myCreators ?? []) as { id: string }[]).map(c => c.id))
    const isMine = (r: Row) => !!r.mentors?.creator_id && myCreatorIds.has(r.mentors.creator_id)

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
        systemPrompt: isMine(r) ? (r.mentors?.system_prompt ?? '') : '',
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
 * 봇 몸 고치기와 공개/비공개는 전부 공개 관문(publish-gate.applyBotEdit)으로 간다 = 공개는 AI 확인을 거친다.
 * 공개 중인 내 봇의 이름, 한 줄 소개(제목), 지시문, 인사말을 고치면 같은 저장에서 내리고 다시 확인한다.
 * 돌려주는 moderation 은 확인을 했을 때만 있다(창구가 422/202 로 바꿔 준다).
 */
export type TeamBotPatch = Partial<Pick<TeamBot, 'pinned' | 'hidden' | 'sortOrder' | 'approvalMode' | 'shape' | 'color' | 'oneLiner' | 'role' | 'name' | 'greeting' | 'systemPrompt' | 'avatarUrl'>> & {
    isPublic?: boolean
    /** 「추가 프롬프트」(비밀 칸, 최대 5,000자). null = 지움. 길이 검사는 창구가 parseExtraPrompt 로 먼저 한다 */
    extraPrompt?: string | null
}

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
    if (patch.extraPrompt !== undefined) body.extra_prompt = patch.extraPrompt
    if (patch.avatarUrl !== undefined) body.avatar_url = patch.avatarUrl
    // 한 줄 소개 → 마켓 제목. 비우면 제목은 그대로 둔다(빈 제목 카드 방지). 내 봇이 아니면 조용히 건너뛴다
    const line = (patch.oneLiner ?? '').trim().slice(0, 40)

    let moderation: ModerationResult | undefined
    if (Object.keys(body).length > 0 || line || publishTarget) {
        const { data: tb } = await db.from('team_bots').select('mentor_id').eq('id', teamBotId).eq('user_id', userId).maybeSingle()
        if (!tb) {
            if (Object.keys(body).length > 0) throw new Error('내 팀에 없는 봇이다')
        } else {
            const { data: creator } = await db.from('creator_profiles').select('id').eq('user_id', userId).maybeSingle()
            if (!creator && Object.keys(body).length > 0) throw new Error('내가 만든 봇이 아니다')
            if (creator) {
                // 내가 만든 몸만 고친다(남의 봇이면 몸은 그대로, 팀 줄만)
                const { data: m } = await db.from('mentors').select('slug').eq('id', tb.mentor_id).eq('creator_id', creator.id).maybeSingle()
                if (m) {
                    // 팀 화면에서 만든 봇만 제목, 설명을 한 줄 소개에 맞춘다. 리더 봇의 긴 설명은 덮지 않는다
                    const slug = (m as { slug: string | null }).slug ?? ''
                    const titleSync = line && slug.startsWith('os-') && !slug.startsWith(DEMO_SLUG_PREFIX) ? { title: line, description: line } : {}
                    const out = await applyBotEdit(db, {
                        mentorId: tb.mentor_id, creatorId: creator.id, actorUserId: userId,
                        fields: { ...body, ...titleSync },
                        wantPublic: publishTarget ? patch.isPublic : undefined,
                    })
                    moderation = out.moderation
                }
            }
        }
    }
    return moderation ? { moderation } : {}
}

/**
 * 공개하기 권한 확인. 내가 만든 봇(mentors.creator_id 가 내 creator_profiles)만. 마켓에서 데려온 봇, 시연 봇은 막는다.
 * 아무것도 쓰지 않는다 = updateTeamBot 이 다른 칸을 쓰기 전에 부른다.
 */
async function authorizePublish(db: SupabaseClient, userId: string, teamBotId: string): Promise<{ mentorId: string; creatorId: string }> {
    const { data: tb } = await db.from('team_bots').select('mentor_id, linked_from_market').eq('id', teamBotId).eq('user_id', userId).maybeSingle()
    const teamRow = tb as { mentor_id: string; linked_from_market: boolean | null } | null
    if (!teamRow) throw new BotPublishDenied('내 팀에 없는 봇이에요')
    if (teamRow.linked_from_market) throw new BotPublishDenied('마켓에서 데려온 봇은 공개할 수 없어요')

    const { data: creator } = await db.from('creator_profiles').select('id').eq('user_id', userId).maybeSingle()
    const creatorId = (creator as { id: string } | null)?.id
    if (!creatorId) throw new BotPublishDenied()
    const { data: m } = await db.from('mentors').select('id, creator_id, slug').eq('id', teamRow.mentor_id).maybeSingle()
    const mentor = m as { id: string; creator_id: string | null; slug: string | null } | null
    if (!mentor || mentor.creator_id !== creatorId) throw new BotPublishDenied()
    if ((mentor.slug ?? '').startsWith(DEMO_SLUG_PREFIX)) throw new BotPublishDenied('시연용 봇은 공개할 수 없어요')
    return { mentorId: mentor.id, creatorId }
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
