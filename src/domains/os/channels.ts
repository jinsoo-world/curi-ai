// domains/os — 그룹 채팅(여러 봇 + 나). 표 3개: channels / channel_members / channel_messages
//
// 그록봇 안티패턴 ㉟ = 「그룹방에서 봇들이 서로 답하다 끝없이 돈다」.
// 그래서 규칙을 코드로 못 박는다:
//   ① 사람 말 한 번에 봇은 **최대 2번**만 말한다(첫 답 봇 1 + 지목당한 봇 1).
//   ② 봇이 지목할 수 있는 건 **한 명**뿐이고, 지목당한 봇은 **다시 지목해도 아무도 안 답한다**.
// 표가 아직 없으면(42P01) 죽지 않고 「준비 중」으로 알린다.

import type { SupabaseClient } from '@supabase/supabase-js'

const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다

export class ChannelTableMissing extends Error {
    constructor() { super('channels 표가 아직 없다. supabase/migrations/20260925_channels.sql 을 실행해야 한다') }
}

/** 한 번 사람 말에 봇이 말할 수 있는 최대 횟수 */
export const MAX_BOT_TURNS = 2
/** 방 하나에 넣을 수 있는 봇 수 */
export const MAX_MEMBERS = 8

export interface Channel {
    id: string
    name: string
    kind: 'group'
    memberMentorIds: string[]
    createdAt: string
}

export interface ChannelMessage {
    id: string
    authorKind: 'user' | 'bot'
    mentorId: string | null
    content: string
    createdAt: string
}

function wrap(error: { code?: string; message: string }): Error {
    return (error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST) ? new ChannelTableMissing() : new Error(error.message)
}

/**
 * 봇 답에서 「@이름」을 찾아 **딱 한 명**을 고른다 (순수 함수 = 시험 대상).
 * - 방 멤버가 아닌 이름은 무시한다.
 * - 방금 말한 봇 자신은 무시한다(자기 자신을 다시 부르지 못한다).
 * - 여러 명이 걸리면 **먼저 나온 한 명만**.
 */
export function findMentionedBot(
    text: string,
    members: { mentorId: string; name: string }[],
    speakerMentorId?: string | null,
): { mentorId: string; name: string } | null {
    const t = text ?? ''
    if (!t.includes('@')) return null
    let best: { at: number; who: { mentorId: string; name: string } } | null = null
    for (const m of members) {
        if (!m.name) continue
        if (speakerMentorId && m.mentorId === speakerMentorId) continue
        const at = t.indexOf(`@${m.name}`)
        if (at >= 0 && (!best || at < best.at)) best = { at, who: { mentorId: m.mentorId, name: m.name } }
    }
    return best ? best.who : null
}

/**
 * 이번 사람 말에 봇이 더 말해도 되는가.
 * 이미 2번 말했으면 안 된다. 봇→봇 답(2번째)은 다시 이어지지 않는다.
 */
export function canBotSpeakAgain(botTurnsSoFar: number): boolean {
    return botTurnsSoFar < MAX_BOT_TURNS
}

/** 방 전체에 말했을 때(@ 없음) 한 번에 답할 봇 수 상한 = 진행 봇 1 + 멤버들. 무한 루프 방지 */
export const MAX_FANOUT_BOTS = 4

/**
 * 사람 말 한 번에 누가 어떤 순서로 답할지 고른다 (순수 함수 = 시험 대상).
 * - 사람이 @이름으로 한 명을 집으면 그 봇만.
 * - 아니면 진행 봇(방에 먼저 넣은 첫 멤버)이 짧게 받은 뒤, 나머지 멤버가 차례로 답한다(상한 MAX_FANOUT_BOTS).
 * 봇끼리 @로 이어 부르는 연쇄는 이 목록 밖에서 기존 2턴 규칙이 막는다.
 */
export function pickResponders(
    text: string,
    members: { mentorId: string; name: string }[],
): { mentorId: string; name: string }[] {
    if (!members.length) return []
    const mentioned = findMentionedBot(text, members)
    if (mentioned) return [mentioned]
    return members.slice(0, MAX_FANOUT_BOTS)
}

/** 작업 중 표지 문구. 예) 「글감봇 작업 중…」 (제품 카피에 가운뎃점/긴 줄표 금지) */
export function botWorkingLabel(name: string): string {
    const n = (name ?? '').trim() || '봇'
    return `${n} 작업 중…`
}

/** 내 그룹방 목록 */
export async function listChannels(db: SupabaseClient, userId: string): Promise<Channel[]> {
    const { data, error } = await db
        .from('channels')
        .select('id, name, kind, created_at, channel_members(mentor_id)')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
    if (error) throw wrap(error)
    return ((data ?? []) as unknown as {
        id: string; name: string; kind: 'group'; created_at: string
        channel_members: { mentor_id: string }[] | null
    }[]).map(r => ({
        id: r.id, name: r.name, kind: r.kind, createdAt: r.created_at,
        memberMentorIds: (r.channel_members ?? []).map(m => m.mentor_id),
    }))
}

/** 내 방 하나 (남의 방이면 null) */
export async function getChannel(db: SupabaseClient, userId: string, channelId: string): Promise<Channel | null> {
    const { data, error } = await db
        .from('channels')
        .select('id, name, kind, created_at, channel_members(mentor_id)')
        .eq('user_id', userId)          // 🔒 남의 방은 안 열린다
        .eq('id', channelId)
        .maybeSingle()
    if (error) throw wrap(error)
    if (!data) return null
    const r = data as unknown as { id: string; name: string; kind: 'group'; created_at: string; channel_members: { mentor_id: string }[] | null }
    return { id: r.id, name: r.name, kind: r.kind, createdAt: r.created_at, memberMentorIds: (r.channel_members ?? []).map(m => m.mentor_id) }
}

/** 방 만들기. 멤버는 **내 팀의 봇**만 들어간다 */
export async function createChannel(
    db: SupabaseClient, userId: string, name: string, mentorIds: string[],
): Promise<Channel> {
    const wanted = [...new Set(mentorIds.filter(Boolean))].slice(0, MAX_MEMBERS)
    if (wanted.length < 2) throw new Error('그룹 채팅은 봇 2명 이상부터 만들 수 있어요')

    const mine = await myMentorIds(db, userId, wanted)
    if (mine.length !== wanted.length) throw new Error('내 팀에 없는 봇이 들어 있어요')

    const { data: ch, error } = await db
        .from('channels')
        .insert({ user_id: userId, name: (name || '내 팀').trim().slice(0, 40), kind: 'group' })
        .select('id, name, kind, created_at')
        .single()
    if (error || !ch) throw wrap(error ?? { message: '방을 만들지 못했다' })

    const { error: mErr } = await db
        .from('channel_members')
        .insert(mine.map(id => ({ channel_id: (ch as { id: string }).id, mentor_id: id })))
    if (mErr) {
        await db.from('channels').delete().eq('id', (ch as { id: string }).id)
        throw wrap(mErr)
    }
    const row = ch as { id: string; name: string; kind: 'group'; created_at: string }
    return { id: row.id, name: row.name, kind: row.kind, createdAt: row.created_at, memberMentorIds: mine }
}

/** 멤버 추가 (내 팀의 봇만) */
export async function addChannelMembers(
    db: SupabaseClient, userId: string, channelId: string, mentorIds: string[],
): Promise<string[]> {
    const ch = await getChannel(db, userId, channelId)
    if (!ch) throw new Error('그 방을 못 찾았어요')
    const wanted = [...new Set(mentorIds.filter(Boolean))].filter(id => !ch.memberMentorIds.includes(id))
    if (wanted.length === 0) return ch.memberMentorIds
    if (ch.memberMentorIds.length + wanted.length > MAX_MEMBERS) throw new Error(`한 방에는 봇 ${MAX_MEMBERS}명까지 넣을 수 있어요`)
    const mine = await myMentorIds(db, userId, wanted)
    if (mine.length !== wanted.length) throw new Error('내 팀에 없는 봇이 들어 있어요')
    const { error } = await db.from('channel_members').insert(mine.map(id => ({ channel_id: channelId, mentor_id: id })))
    if (error) throw wrap(error)
    return [...ch.memberMentorIds, ...mine]
}

/**
 * 멤버 빼기 (내 방에서만).
 * 방은 봇 2명 이상이어야 하므로 **2명 아래로는 못 뺀다** — 한 명만 남은 「그룹」은 그룹이 아니다.
 */
export async function removeChannelMembers(
    db: SupabaseClient, userId: string, channelId: string, mentorIds: string[],
): Promise<string[]> {
    const ch = await getChannel(db, userId, channelId)
    if (!ch) throw new Error('그 방을 못 찾았어요')
    const 뺄것 = [...new Set(mentorIds.filter(Boolean))].filter(id => ch.memberMentorIds.includes(id))
    if (뺄것.length === 0) return ch.memberMentorIds
    const 남는수 = ch.memberMentorIds.length - 뺄것.length
    if (남는수 < 2) throw new Error('그룹에는 봇이 2명 이상 있어야 해요')
    const { error } = await db
        .from('channel_members')
        .delete()
        .eq('channel_id', channelId)
        .in('mentor_id', 뺄것)
    if (error) throw wrap(error)
    return ch.memberMentorIds.filter(id => !뺄것.includes(id))
}

/** 주어진 봇들 중 내 팀에 있는 것만 (순서 유지) */
async function myMentorIds(db: SupabaseClient, userId: string, mentorIds: string[]): Promise<string[]> {
    if (mentorIds.length === 0) return []
    const { data, error } = await db
        .from('team_bots')
        .select('mentor_id')
        .eq('user_id', userId)
        .in('mentor_id', mentorIds)
    if (error) throw wrap(error)
    const mine = new Set(((data ?? []) as { mentor_id: string }[]).map(r => r.mentor_id))
    return mentorIds.filter(id => mine.has(id))
}

/** 방의 말 목록 */
export async function listChannelMessages(
    db: SupabaseClient, userId: string, channelId: string, limit = 60,
): Promise<ChannelMessage[]> {
    const ch = await getChannel(db, userId, channelId)
    if (!ch) throw new Error('그 방을 못 찾았어요')
    const { data, error } = await db
        .from('channel_messages')
        .select('id, author_kind, mentor_id, content, created_at')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(limit)
    if (error) throw wrap(error)
    return ((data ?? []) as {
        id: string; author_kind: 'user' | 'bot'; mentor_id: string | null; content: string; created_at: string
    }[]).map(r => ({ id: r.id, authorKind: r.author_kind, mentorId: r.mentor_id, content: r.content, createdAt: r.created_at }))
}

export interface ChannelBot {
    mentorId: string
    name: string
    systemPrompt: string
    shape: string
    color: string
    avatarUrl: string | null
}

/**
 * 방에 있는 봇들의 몸(이름, 설명, 캐릭터). 내 팀(team_bots)에 아직 있는 봇만 돌려준다.
 * 팀에서 뺀 봇은 방에서도 말하지 않는다.
 */
export async function getChannelBots(
    db: SupabaseClient, userId: string, mentorIds: string[],
): Promise<ChannelBot[]> {
    if (mentorIds.length === 0) return []
    const { data, error } = await db
        .from('team_bots')
        .select('mentor_id, shape, color, mentors(name, system_prompt, avatar_url)')
        .eq('user_id', userId)
        .in('mentor_id', mentorIds)
    if (error) throw wrap(error)
    const rows = (data ?? []) as unknown as {
        mentor_id: string; shape: string; color: string
        mentors: { name: string; system_prompt: string | null; avatar_url: string | null } | null
    }[]
    const byId = new Map(rows.map(r => [r.mentor_id, r]))
    // 방에 넣은 순서를 지킨다
    return mentorIds.flatMap(id => {
        const r = byId.get(id)
        if (!r) return []
        return [{
            mentorId: r.mentor_id,
            name: r.mentors?.name ?? '이름 없는 봇',
            systemPrompt: r.mentors?.system_prompt ?? '',
            shape: r.shape, color: r.color,
            avatarUrl: r.mentors?.avatar_url ?? null,
        }]
    })
}

/** 말 한 줄 저장 */
export async function saveChannelMessage(
    db: SupabaseClient, channelId: string,
    msg: { authorKind: 'user' | 'bot'; mentorId?: string | null; content: string },
): Promise<ChannelMessage> {
    const { data, error } = await db
        .from('channel_messages')
        .insert({
            channel_id: channelId,
            author_kind: msg.authorKind,
            mentor_id: msg.mentorId ?? null,
            content: msg.content.slice(0, 8000),
        })
        .select('id, author_kind, mentor_id, content, created_at')
        .single()
    if (error || !data) throw wrap(error ?? { message: '말을 저장하지 못했다' })
    const r = data as { id: string; author_kind: 'user' | 'bot'; mentor_id: string | null; content: string; created_at: string }
    return { id: r.id, authorKind: r.author_kind, mentorId: r.mentor_id, content: r.content, createdAt: r.created_at }
}
