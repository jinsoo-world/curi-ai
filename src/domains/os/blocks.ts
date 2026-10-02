// domains/os — 봇 차단 (서버 전용, 가벼운 조각). 애플 심사 지침 1.2 (1002).
//
// 차단 = user_bot_blocks 한 줄. 그 회원에게만 마켓, 팀 목록, 1:1 대화, 그룹방, 전달, 멘션, 초안, 루틴, 먼저 말 걸기에서 빠진다.
//   차단할 때 = 팀 줄(team_bots.hidden)을 숨기고 그 봇의 켜진 루틴을 멈춘다. 처음 상태는 차단 줄에 적어 둔다(was_hidden, paused_routine_ids)
//   해제할 때 = 적어 둔 대로 되돌린다 (원래 숨긴 봇은 숨긴 채로, 원래 꺼진 루틴은 꺼진 채로)
// 표가 아직 없으면(마이그레이션 전) 차단 목록은 빈 것으로 본다 = 대화가 멈추지 않는다. 쓰기는 ReportTableMissing.
// 이 파일은 무거운 것(공개 관문, 모델)을 부르지 않는다 = knowledge.assertBotInTeam 이 그대로 가져다 쓴다.

import type { SupabaseClient } from '@supabase/supabase-js'

const TABLE_MISSING = new Set(['42P01', 'PGRST205'])

export class ReportTableMissing extends Error {
    constructor() { super('신고 표가 아직 준비되지 않았어요') }
}

export function isTableMissing(error: { code?: string } | null | undefined): boolean {
    return !!error?.code && TABLE_MISSING.has(error.code)
}

/** 이 회원이 차단한 봇 id. 실패하면 빈 것(막지 않는다) */
export async function listBlockedMentorIds(db: SupabaseClient, userId: string | null | undefined): Promise<Set<string>> {
    if (!userId) return new Set()
    try {
        const { data, error } = await db.from('user_bot_blocks').select('mentor_id').eq('user_id', userId)
        if (error) {
            if (!isTableMissing(error)) console.error('[os/blocks] 차단 목록 읽기 실패', error.message)
            return new Set()
        }
        return new Set(((data ?? []) as { mentor_id: string }[]).map(r => r.mentor_id))
    } catch (e) {
        console.error('[os/blocks] 차단 목록 읽기 실패', e instanceof Error ? e.message : e)
        return new Set()
    }
}

export async function isBotBlocked(db: SupabaseClient, userId: string | null | undefined, mentorId: string): Promise<boolean> {
    if (!userId || !mentorId) return false
    return (await listBlockedMentorIds(db, userId)).has(mentorId)
}

/** 목록에서 차단한 봇을 뺀다 */
export function withoutBlocked<T>(items: T[], blocked: Set<string>, idOf: (t: T) => string): T[] {
    if (blocked.size === 0) return items
    return items.filter(t => !blocked.has(idOf(t)))
}

/** 차단 = 팀 줄 숨김 + 켜진 루틴 멈춤. 이미 차단돼 있으면 처음 적어 둔 상태를 덮지 않는다 */
export async function blockBot(db: SupabaseClient, userId: string, mentorId: string): Promise<void> {
    const { data: existing, error: exErr } = await db.from('user_bot_blocks').select('user_id').eq('user_id', userId).eq('mentor_id', mentorId).maybeSingle()
    if (exErr) { if (isTableMissing(exErr)) throw new ReportTableMissing(); throw new Error(exErr.message) }
    if (existing) return

    const { data: team } = await db.from('team_bots').select('id, hidden').eq('user_id', userId).eq('mentor_id', mentorId)
    const teamRows = (team ?? []) as { id: string; hidden: boolean | null }[]
    const { data: routines } = await db.from('bot_routines').select('id').eq('user_id', userId).eq('mentor_id', mentorId).eq('enabled', true)
    const paused = ((routines ?? []) as { id: string }[]).map(r => r.id)

    const { error } = await db.from('user_bot_blocks').upsert(
        { user_id: userId, mentor_id: mentorId, was_hidden: teamRows.some(r => !!r.hidden), paused_routine_ids: paused },
        { onConflict: 'user_id,mentor_id', ignoreDuplicates: true },
    )
    if (error) { if (isTableMissing(error)) throw new ReportTableMissing(); throw new Error(error.message) }

    if (teamRows.length > 0) await db.from('team_bots').update({ hidden: true }).eq('user_id', userId).eq('mentor_id', mentorId)
    if (paused.length > 0) await db.from('bot_routines').update({ enabled: false }).eq('user_id', userId).in('id', paused)
}

/** 해제 = 적어 둔 대로 되돌린다 */
export async function unblockBot(db: SupabaseClient, userId: string, mentorId: string): Promise<void> {
    const { data: row, error: readErr } = await db.from('user_bot_blocks').select('was_hidden, paused_routine_ids').eq('user_id', userId).eq('mentor_id', mentorId).maybeSingle()
    if (readErr) { if (isTableMissing(readErr)) throw new ReportTableMissing(); throw new Error(readErr.message) }
    const { error } = await db.from('user_bot_blocks').delete().eq('user_id', userId).eq('mentor_id', mentorId)
    if (error) { if (isTableMissing(error)) throw new ReportTableMissing(); throw new Error(error.message) }
    if (!row) return
    const r = row as { was_hidden: boolean | null; paused_routine_ids: string[] | null }
    await db.from('team_bots').update({ hidden: !!r.was_hidden }).eq('user_id', userId).eq('mentor_id', mentorId)
    const paused = r.paused_routine_ids ?? []
    if (paused.length > 0) await db.from('bot_routines').update({ enabled: true }).eq('user_id', userId).eq('mentor_id', mentorId).in('id', paused)
}

export interface BlockedBot { mentorId: string; name: string; avatarUrl: string | null; blockedAt: string | null }

/** 설정 「차단한 봇」 목록 (이름, 사진 같이) */
export async function listBlockedBots(db: SupabaseClient, userId: string): Promise<BlockedBot[]> {
    const { data, error } = await db.from('user_bot_blocks').select('mentor_id, created_at').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) { if (isTableMissing(error)) return []; throw new Error(error.message) }
    const rows = (data ?? []) as { mentor_id: string; created_at: string | null }[]
    if (rows.length === 0) return []
    const { data: ms } = await db.from('mentors').select('id, name, avatar_url').in('id', rows.map(r => r.mentor_id))
    const byId = new Map(((ms ?? []) as { id: string; name: string | null; avatar_url: string | null }[]).map(m => [m.id, m]))
    return rows.map(r => ({
        mentorId: r.mentor_id,
        name: byId.get(r.mentor_id)?.name ?? '사라진 봇',
        avatarUrl: byId.get(r.mentor_id)?.avatar_url ?? null,
        blockedAt: r.created_at,
    }))
}
