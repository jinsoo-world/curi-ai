// domains/os — Audience DB 읽기·쓰기 (서버 전용. service_role 이라 소유자 확인을 여기서 반드시 건다)
import type { SupabaseClient } from '@supabase/supabase-js'
import {
    checkAudience, cleanVisitorLimit, defaultAudienceLevel, isAudienceLevel, type AudienceLevel,
} from './audience'
import { countUserTurnsForMentor } from './usage-db'
import { weekStartKST } from './usage'

/** 표가 아직 DB 에 없을 때(마이그레이션 미적용) 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'

export class AudienceTableMissing extends Error {
    constructor() { super('audience 표가 아직 없다. supabase/migrations/20261001_audience.sql 을 실행해야 한다') }
}

export class AudienceNotOwner extends Error {
    constructor() { super('이 봇의 주인이 아니다') }
}

function isTableMissing(error: unknown): boolean {
    return !!error && typeof error === 'object' && (error as { code?: string }).code === TABLE_MISSING
}

export interface AudienceSettings {
    level: AudienceLevel
    messageLimitPerWeek: number | null
    voiceMinutesPerWeek: number | null
}

/** 이 봇(mentor)의 주인 user_id. 내가 만든 개인 봇(team_bots, 마켓 연동 아님) → 없으면 리더 계정(creator_profiles) */
export async function resolveMentorOwnerId(
    db: SupabaseClient,
    mentor: { id: string; creator_id?: string | null },
): Promise<string | null> {
    const { data: tb } = await db
        .from('team_bots')
        .select('user_id')
        .eq('mentor_id', mentor.id)
        .eq('linked_from_market', false)
        .maybeSingle()
    if (tb?.user_id) return tb.user_id as string

    if (mentor.creator_id) {
        const { data: cp } = await db.from('creator_profiles').select('user_id').eq('id', mentor.creator_id).maybeSingle()
        if (cp?.user_id) return cp.user_id as string
    }
    return null
}

/** bot_audience 행. 없으면 null (호출측이 defaultAudienceLevel 로 기본값을 채운다) */
async function readAudienceRow(db: SupabaseClient, mentorId: string): Promise<AudienceSettings | null> {
    const { data, error } = await db
        .from('bot_audience')
        .select('level, message_limit_per_week, voice_minutes_per_week')
        .eq('mentor_id', mentorId)
        .maybeSingle()
    if (error) {
        if (isTableMissing(error)) return null
        throw new Error(error.message)
    }
    if (!data) return null
    return {
        level: isAudienceLevel(data.level) ? data.level : 'just_me',
        messageLimitPerWeek: (data.message_limit_per_week as number | null) ?? null,
        voiceMinutesPerWeek: (data.voice_minutes_per_week as number | null) ?? null,
    }
}

/** 설정 화면용: 행이 없으면 이 봇 성격에 맞는 기본값을 채워 돌려준다 */
export async function getAudienceSettings(
    db: SupabaseClient,
    mentor: { id: string; is_active?: boolean | null },
): Promise<AudienceSettings> {
    const row = await readAudienceRow(db, mentor.id)
    if (row) return row
    return { level: defaultAudienceLevel(!!mentor.is_active), messageLimitPerWeek: null, voiceMinutesPerWeek: null }
}

/** 주인만 바꿀 수 있다. 호출측(API)이 이미 owner_user_id 를 확인했다는 전제 — 여기서도 한 번 더 건다(방어적 이중 확인) */
export async function saveAudienceSettings(
    db: SupabaseClient,
    mentorId: string,
    ownerUserId: string,
    patch: { level: AudienceLevel; messageLimitPerWeek?: unknown; voiceMinutesPerWeek?: unknown },
): Promise<void> {
    const { error } = await db.from('bot_audience').upsert({
        mentor_id: mentorId,
        owner_user_id: ownerUserId,
        level: patch.level,
        message_limit_per_week: cleanVisitorLimit(patch.messageLimitPerWeek),
        voice_minutes_per_week: cleanVisitorLimit(patch.voiceMinutesPerWeek),
        updated_at: new Date().toISOString(),
    }, { onConflict: 'mentor_id' })
    if (error) {
        if (isTableMissing(error)) throw new AudienceTableMissing()
        throw new Error(error.message)
    }
}

/** 이 봇에 연결된 접근 그룹(Insiders) 중 하나에라도 이 방문자가 들어 있나 */
async function isVisitorInAllowedGroups(
    db: SupabaseClient,
    mentorId: string,
    viewer: { userId: string | null; email: string | null },
): Promise<boolean> {
    if (!viewer.userId && !viewer.email) return false
    const { data: links, error } = await db.from('bot_access_groups').select('group_id').eq('mentor_id', mentorId)
    if (error) {
        if (isTableMissing(error)) return false
        throw new Error(error.message)
    }
    const groupIds = (links ?? []).map(l => (l as { group_id: string }).group_id)
    if (groupIds.length === 0) return false

    if (viewer.userId) {
        const { count } = await db.from('access_group_members').select('id', { count: 'exact', head: true })
            .in('group_id', groupIds).eq('user_id', viewer.userId)
        if ((count ?? 0) > 0) return true
    }
    if (viewer.email) {
        const { count } = await db.from('access_group_members').select('id', { count: 'exact', head: true })
            .in('group_id', groupIds).ilike('email', viewer.email)
        if ((count ?? 0) > 0) return true
    }
    return false
}

export interface AudienceGate {
    allowed: boolean
    message: string | null
    level: AudienceLevel
}

/**
 * 대화 API 용 한 방 검사: 「이 사람이 이 봇과 대화해도 되나」.
 * 표가 없거나 조회 중 오류가 나면 막지 않는다(새 기능 하나 때문에 있던 대화가 끊기면 안 된다).
 */
export async function checkChatAudience(
    db: SupabaseClient,
    mentor: { id: string; is_active?: boolean | null; creator_id?: string | null },
    viewer: { userId: string | null; email: string | null },
): Promise<AudienceGate> {
    try {
        const ownerUserId = await resolveMentorOwnerId(db, mentor)
        const isOwner = !!ownerUserId && ownerUserId === viewer.userId
        const settings = await getAudienceSettings(db, mentor)
        let inAllowedGroup = false
        if (!isOwner && settings.level === 'insiders') {
            inAllowedGroup = await isVisitorInAllowedGroups(db, mentor.id, viewer)
        }
        const result = checkAudience({ level: settings.level, isOwner, isLoggedIn: !!viewer.userId, inAllowedGroup })
        return { allowed: result.allowed, message: result.message, level: settings.level }
    } catch (e) {
        console.error('[os/audience] checkChatAudience', e instanceof Error ? e.message : e)
        return { allowed: true, message: null, level: 'public' }
    }
}


/**
 * 방문자 1인당 주간 한도 — 봇 주인이 Audience 시트에서 정한 messageLimitPerWeek.
 * 주인 본인·한도 미설정·비로그인은 통과. 표 오류 시에도 막지 않는다(대화가 끊기면 안 된다).
 * (요금제 한도와의 min 은 내 팀 봇 경로의 readUsage 가 따로 지킨다. 여기는 「이 봇」캡만.)
 */
export async function checkVisitorBotWeeklyLimit(
    db: SupabaseClient,
    mentor: { id: string; is_active?: boolean | null; creator_id?: string | null },
    viewer: { userId: string | null; email?: string | null },
    now = new Date(),
): Promise<{ allowed: boolean; message: string | null; used: number; limit: number | null }> {
    try {
        if (!viewer.userId) return { allowed: true, message: null, used: 0, limit: null }
        const ownerId = await resolveMentorOwnerId(db, mentor)
        if (ownerId && ownerId === viewer.userId) return { allowed: true, message: null, used: 0, limit: null }

        const settings = await getAudienceSettings(db, mentor)
        const limit = settings.messageLimitPerWeek
        if (limit == null) return { allowed: true, message: null, used: 0, limit: null }

        const used = await countUserTurnsForMentor(db, viewer.userId, mentor.id, weekStartKST(now))
        if (used >= limit) {
            return {
                allowed: false,
                message: `이 봇 주인이 정해 둔 방문자 주간 한도(${limit}번)에 닿았어요. 다음 주 월요일 0시(서울)에 다시 채워져요.`,
                used,
                limit,
            }
        }
        return { allowed: true, message: null, used, limit }
    } catch (e) {
        console.error('[os/audience] checkVisitorBotWeeklyLimit', e instanceof Error ? e.message : e)
        return { allowed: true, message: null, used: 0, limit: null }
    }
}

// ── 접근 그룹(Insiders) 관리 — 설정 화면(AudienceSheet)이 쓴다. 전부 owner_user_id 를 직접 건다 ──

export interface AccessGroupMember { id: string; email: string | null; userId: string | null; invitedAt: string }
export interface AccessGroupView { id: string; name: string; createdAt: string; members: AccessGroupMember[] }

export async function listMyGroups(db: SupabaseClient, ownerUserId: string): Promise<AccessGroupView[]> {
    const { data: groups, error } = await db.from('access_groups').select('id, name, created_at')
        .eq('owner_user_id', ownerUserId).order('created_at', { ascending: true })
    if (error) {
        if (isTableMissing(error)) return []
        throw new Error(error.message)
    }
    const rows = groups ?? []
    if (rows.length === 0) return []
    const groupIds = rows.map(g => g.id as string)
    const { data: members } = await db.from('access_group_members').select('id, group_id, email, user_id, invited_at').in('group_id', groupIds)
    const byGroup = new Map<string, AccessGroupMember[]>()
    for (const m of (members ?? []) as { id: string; group_id: string; email: string | null; user_id: string | null; invited_at: string }[]) {
        const list = byGroup.get(m.group_id) ?? []
        list.push({ id: m.id, email: m.email, userId: m.user_id, invitedAt: m.invited_at })
        byGroup.set(m.group_id, list)
    }
    return rows.map(g => ({ id: g.id as string, name: g.name as string, createdAt: g.created_at as string, members: byGroup.get(g.id as string) ?? [] }))
}

/** 이 봇이 지금 Insiders 로 쓰고 있는 그룹 id 들 */
export async function listBotGroupIds(db: SupabaseClient, mentorId: string): Promise<string[]> {
    const { data, error } = await db.from('bot_access_groups').select('group_id').eq('mentor_id', mentorId)
    if (error) {
        if (isTableMissing(error)) return []
        throw new Error(error.message)
    }
    return (data ?? []).map(r => (r as { group_id: string }).group_id)
}

async function assertGroupOwner(db: SupabaseClient, ownerUserId: string, groupId: string): Promise<void> {
    const { data } = await db.from('access_groups').select('id').eq('id', groupId).eq('owner_user_id', ownerUserId).maybeSingle()
    if (!data) throw new AudienceNotOwner()
}

export async function createGroup(db: SupabaseClient, ownerUserId: string, name: string): Promise<AccessGroupView> {
    const clean = name.trim().slice(0, 40) || '내 그룹'
    const { data, error } = await db.from('access_groups').insert({ owner_user_id: ownerUserId, name: clean }).select('id, name, created_at').single()
    if (error) {
        if (isTableMissing(error)) throw new AudienceTableMissing()
        throw new Error(error.message)
    }
    return { id: data.id, name: data.name, createdAt: data.created_at, members: [] }
}

export async function deleteGroup(db: SupabaseClient, ownerUserId: string, groupId: string): Promise<void> {
    await assertGroupOwner(db, ownerUserId, groupId)
    const { error } = await db.from('access_groups').delete().eq('id', groupId)
    if (error) throw new Error(error.message)
}

/** 이메일로 초대. 이미 가입한 이메일이면 user_id 도 같이 채운다(그래야 로그인 뒤 바로 통과) */
export async function addGroupMember(db: SupabaseClient, ownerUserId: string, groupId: string, email: string): Promise<AccessGroupMember> {
    await assertGroupOwner(db, ownerUserId, groupId)
    const clean = email.trim().toLowerCase()
    if (!clean || !clean.includes('@')) throw new Error('올바른 이메일이 아니에요')

    let userId: string | null = null
    const { data: existing } = await db.from('users').select('id').ilike('email', clean).maybeSingle()
    if (existing?.id) userId = existing.id

    const { data, error } = await db.from('access_group_members')
        .upsert({ group_id: groupId, email: clean, user_id: userId }, { onConflict: 'group_id,email' })
        .select('id, email, user_id, invited_at').single()
    if (error) {
        if (isTableMissing(error)) throw new AudienceTableMissing()
        throw new Error(error.message)
    }
    return { id: data.id, email: data.email, userId: data.user_id, invitedAt: data.invited_at }
}

export async function removeGroupMember(db: SupabaseClient, ownerUserId: string, groupId: string, memberId: string): Promise<void> {
    await assertGroupOwner(db, ownerUserId, groupId)
    const { error } = await db.from('access_group_members').delete().eq('id', memberId).eq('group_id', groupId)
    if (error) throw new Error(error.message)
}

/** 이 봇의 Insiders 그룹 목록을 통째로 바꾼다(체크박스 저장) */
export async function setBotGroups(db: SupabaseClient, ownerUserId: string, mentorId: string, groupIds: string[]): Promise<void> {
    for (const gid of groupIds) await assertGroupOwner(db, ownerUserId, gid)
    const { error: delErr } = await db.from('bot_access_groups').delete().eq('mentor_id', mentorId)
    if (delErr && !isTableMissing(delErr)) throw new Error(delErr.message)
    if (groupIds.length === 0) return
    const { error } = await db.from('bot_access_groups').insert(groupIds.map(group_id => ({ mentor_id: mentorId, group_id })))
    if (error) {
        if (isTableMissing(error)) throw new AudienceTableMissing()
        throw new Error(error.message)
    }
}
