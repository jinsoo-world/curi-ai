// domains/os — 봇 팀 읽기·쓰기 (서버에서만 부른다. db 는 service_role 이라 user_id 를 여기서 반드시 건다)

import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureCreatorProfile } from '@/domains/creator'
import { buildBotPrompt, findJob } from './presets'
import type { NewBotInput, TeamBot } from './types'

/** 표가 아직 DB 에 없을 때(마이그레이션 미적용) 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'

type Row = {
    id: string; mentor_id: string; role: TeamBot['role']; shape: TeamBot['shape']; color: TeamBot['color']
    one_liner: string | null; approval_mode: TeamBot['approvalMode']; pinned: boolean; hidden: boolean
    sort_order: number; created_at: string
    mentors: { name: string; avatar_url: string | null; greeting_message: string } | null
}

export class TeamTableMissing extends Error {
    constructor() { super('team_bots 표가 아직 없다. supabase/migrations/20260923_agent_os_p0.sql 을 실행해야 한다') }
}

/** 내 팀 명단 (숨긴 봇 포함, 화면이 가른다) */
export async function listTeam(db: SupabaseClient, userId: string): Promise<TeamBot[]> {
    const { data, error } = await db
        .from('team_bots')
        .select('id, mentor_id, role, shape, color, one_liner, approval_mode, pinned, hidden, sort_order, created_at, mentors(name, avatar_url, greeting_message)')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
    if (error) {
        if (error.code === TABLE_MISSING) throw new TeamTableMissing()
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
        greeting: r.mentors?.greeting_message ?? '',
        knowledgeCount: countMap.get(r.mentor_id) ?? 0,
        createdAt: r.created_at,
    }))
}

/**
 * 새 봇 만들기 = mentors 한 줄(봇의 몸) + team_bots 한 줄(팀 소속·캐릭터).
 * 개인 봇은 공개 목록에 안 뜨게 is_active=false 로 넣는다(공개 목록은 is_active=true 만 뽑는다).
 */
export async function createTeamBot(
    db: SupabaseClient,
    user: { id: string; displayName: string },
    input: NewBotInput,
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
            system_prompt: buildBotPrompt(input, user.displayName),
            greeting_message: `안녕하세요, ${input.name.trim()}이에요. ${job.firstTask}`,
            sample_questions: [],
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
        if (tErr?.code === TABLE_MISSING) throw new TeamTableMissing()
        throw new Error(tErr?.message ?? '팀에 넣지 못했다')
    }

    return {
        id: tb.id, mentorId: mentor.id, name: mentor.name, role: tb.role, shape: tb.shape, color: tb.color,
        oneLiner: tb.one_liner, approvalMode: tb.approval_mode, pinned: tb.pinned, hidden: tb.hidden,
        sortOrder: tb.sort_order, avatarUrl: mentor.avatar_url, greeting: mentor.greeting_message,
        knowledgeCount: 0, createdAt: tb.created_at,
    }
}

/** 고정·숨김·정렬만 바꾼다 (캐릭터·승인 모드 변경은 다음 날) */
export async function updateTeamBot(
    db: SupabaseClient, userId: string, teamBotId: string,
    patch: Partial<Pick<TeamBot, 'pinned' | 'hidden' | 'sortOrder' | 'approvalMode' | 'shape' | 'color' | 'oneLiner'>>,
) {
    const row: Record<string, unknown> = {}
    if (patch.pinned !== undefined) row.pinned = patch.pinned
    if (patch.hidden !== undefined) row.hidden = patch.hidden
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder
    if (patch.approvalMode !== undefined) row.approval_mode = patch.approvalMode
    if (patch.shape !== undefined) row.shape = patch.shape
    if (patch.color !== undefined) row.color = patch.color
    if (patch.oneLiner !== undefined) row.one_liner = patch.oneLiner
    if (Object.keys(row).length === 0) return
    const { error } = await db.from('team_bots').update(row).eq('id', teamBotId).eq('user_id', userId)
    if (error) throw new Error(error.message)
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
        .eq('mentor_id', mentorId)
        .maybeSingle()
    if (error || !data) return null
    return (data as unknown as { mentors: Record<string, unknown> | null }).mentors
}
