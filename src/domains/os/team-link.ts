// domains/os — 봇 마켓 봇을 내 팀에 넣기(연동), 빼기, 연동 수 세기, 봇 주인에게 알리기.
//
// 규칙
//  - 연동한 봇은 team_bots.linked_from_market = true 로 들어간다. 내가 만든 봇(false)만 무료다.
//  - 내가 만든 봇을 내 팀에 넣으면 그건 연동이 아니다(false, 기록·알림 없음).
//  - 연동 수는 bot_links 를 매번 센다(mentor_link_counts 뷰). mentors 표에 칸을 늘리지 않는다.
//  - 봇 주인 알림은 같은 사람 × 같은 봇 = 하루 1회.
//  - 서버(service_role)에서만 부른다. user_id 는 여기서 반드시 건다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchWith } from '@/domains/messaging'

/** 표가 아직 DB 에 없을 때(마이그레이션 미적용) 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다
/** 칸이 아직 없을 때 */
const COLUMN_MISSING = '42703'

export class LinkTableMissing extends Error {
    constructor() { super('bot_links 표가 아직 없다. supabase/migrations/20260931_bot_links_payout.sql 을 실행해야 한다') }
}

export type LinkOutcome =
    | { status: 'linked'; linkCount: number; teamBotId: string; notified: boolean }
    | { status: 'already'; linkCount: number }
    | { status: 'own' }            // 내가 만든 봇 = 연동이 아니라 그냥 팀에 넣었다(무료)
    | { status: 'not_found' }      // 공개 봇이 아니다

export interface LinkCount { linkCount: number; monthNew: number }

/** 리더 대시보드 한 줄: 내 봇 하나의 연동 수 */
export interface OwnerBotLinkStat { mentorId: string; name: string; linkCount: number; monthNew: number }

// ───────────────────────── 순수 규칙 (시험은 여기를 본다) ─────────────────────────

/** 한국 날짜 열쇠 'YYYY-MM-DD' */
export function kstDayKey(d: Date): string {
    return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** 봇 주인에게 알릴까 = 같은 사람 × 같은 봇은 하루 1회 */
export function shouldNotifyOwner(lastNotifiedAt: string | null | undefined, now: Date = new Date()): boolean {
    if (!lastNotifiedAt) return true
    const last = new Date(lastNotifiedAt)
    if (Number.isNaN(last.getTime())) return true
    return kstDayKey(last) !== kstDayKey(now)
}

/** 알림 글 한 줄 */
export function linkNoticeText(linkerName: string, botName: string, total: number): string {
    const who = (linkerName || '').trim() || '누군가'
    return `${who}님이 [${botName}]을 팀에 넣었어요 (누적 ${total}명)`
}

/**
 * 연동으로 볼까 = 봇 주인이 아닌 사람이 공개 봇을 넣을 때만.
 * 내가 만든 봇은 linked_from_market=false (무료 유지), 기록·알림 없음.
 */
export function decideLinkKind(input: { mentorOwnerUserId: string | null; userId: string; isActive: boolean }): 'link' | 'own' | 'not_found' {
    if (!input.isActive) return 'not_found'
    if (input.mentorOwnerUserId && input.mentorOwnerUserId === input.userId) return 'own'
    return 'link'
}

// ───────────────────────── DB ─────────────────────────

type MentorRow = {
    id: string; name: string; is_active: boolean
    creator_profiles: { user_id: string } | { user_id: string }[] | null
}

/** 공개 봇 한 줄 + 주인의 user_id */
async function findPublicMentor(db: SupabaseClient, mentorId: string): Promise<{ id: string; name: string; isActive: boolean; ownerUserId: string | null } | null> {
    const { data, error } = await db
        .from('mentors')
        .select('id, name, is_active, creator_profiles(user_id)')
        .eq('id', mentorId)
        .maybeSingle()
    if (error || !data) return null
    const row = data as unknown as MentorRow
    const cp = Array.isArray(row.creator_profiles) ? row.creator_profiles[0] : row.creator_profiles
    return { id: row.id, name: row.name, isActive: !!row.is_active, ownerUserId: cp?.user_id ?? null }
}

/** 봇 여러 개의 연동 수를 한 번에. 뷰가 없으면 빈 지도(화면이 죽지 않는다) */
export async function getLinkCounts(db: SupabaseClient, mentorIds: string[]): Promise<Map<string, LinkCount>> {
    const map = new Map<string, LinkCount>()
    if (mentorIds.length === 0) return map
    const { data, error } = await db
        .from('mentor_link_counts')
        .select('mentor_id, link_count, month_new')
        .in('mentor_id', mentorIds)
    if (error) return map
    for (const r of (data ?? []) as { mentor_id: string; link_count: number | string; month_new: number | string }[]) {
        map.set(r.mentor_id, { linkCount: Number(r.link_count) || 0, monthNew: Number(r.month_new) || 0 })
    }
    return map
}

export async function getLinkCount(db: SupabaseClient, mentorId: string): Promise<number> {
    return (await getLinkCounts(db, [mentorId])).get(mentorId)?.linkCount ?? 0
}

/** 이 사람 팀에 이 봇이 있나 (연동이든 내가 만든 것이든) */
export async function isInMyTeam(db: SupabaseClient, userId: string, mentorId: string): Promise<{ inTeam: boolean; teamBotId: string | null; linkedFromMarket: boolean }> {
    const { data, error } = await db
        .from('team_bots')
        .select('id, linked_from_market')
        .eq('user_id', userId)
        .eq('mentor_id', mentorId)
        .maybeSingle()
    if (error && error.code === COLUMN_MISSING) {
        // 칸이 아직 없으면 예전 모양으로 다시 묻는다
        const { data: old } = await db.from('team_bots').select('id').eq('user_id', userId).eq('mentor_id', mentorId).maybeSingle()
        return { inTeam: !!old, teamBotId: (old as { id: string } | null)?.id ?? null, linkedFromMarket: false }
    }
    const row = data as { id: string; linked_from_market: boolean } | null
    return { inTeam: !!row, teamBotId: row?.id ?? null, linkedFromMarket: !!row?.linked_from_market }
}

/**
 * 마켓 봇을 내 팀에 넣는다.
 *  1) 공개 봇인지 확인  2) 이미 있으면 안내  3) team_bots 삽입(연동이면 linked_from_market=true)
 *  4) bot_links 기록  5) 봇 주인에게 알림(하루 1회)
 */
export async function linkMarketBot(
    db: SupabaseClient,
    user: { id: string; displayName: string },
    mentorId: string,
    now: Date = new Date(),
): Promise<LinkOutcome> {
    const mentor = await findPublicMentor(db, mentorId)
    if (!mentor) return { status: 'not_found' }
    const kind = decideLinkKind({ mentorOwnerUserId: mentor.ownerUserId, userId: user.id, isActive: mentor.isActive })
    if (kind === 'not_found') return { status: 'not_found' }

    const mine = await isInMyTeam(db, user.id, mentorId)
    if (mine.inTeam) {
        if (kind === 'own') return { status: 'own' }
        return { status: 'already', linkCount: await getLinkCount(db, mentorId) }
    }

    // 3) 팀에 넣기 (모양·색은 표 기본값)
    const { data: tb, error: tErr } = await db
        .from('team_bots')
        .insert({ user_id: user.id, mentor_id: mentorId, role: 'helper', linked_from_market: kind === 'link' })
        .select('id')
        .single()
    if (tErr || !tb) {
        if (tErr?.code === '23505') return kind === 'own' ? { status: 'own' } : { status: 'already', linkCount: await getLinkCount(db, mentorId) }
        if (tErr?.code === COLUMN_MISSING) throw new LinkTableMissing()
        throw new Error(tErr?.message ?? '팀에 넣지 못했다')
    }
    if (kind === 'own') return { status: 'own' }

    // 4) 연동 기록 (다시 넣는 사람은 active 만 켠다. 처음 넣은 날은 그대로)
    const { data: prev, error: pErr } = await db
        .from('bot_links')
        .select('id, last_notified_at')
        .eq('mentor_id', mentorId)
        .eq('user_id', user.id)
        .maybeSingle()
    if ((pErr?.code === TABLE_MISSING || pErr?.code === TABLE_MISSING_REST)) throw new LinkTableMissing()
    const prevRow = prev as { id: string; last_notified_at: string | null } | null
    const notify = shouldNotifyOwner(prevRow?.last_notified_at, now)
    if (prevRow) {
        await db.from('bot_links').update({ active: true, ...(notify ? { last_notified_at: now.toISOString() } : {}) }).eq('id', prevRow.id)
    } else {
        const { error: iErr } = await db.from('bot_links').insert({ mentor_id: mentorId, user_id: user.id, active: true, last_notified_at: notify ? now.toISOString() : null })
        if (iErr && iErr.code !== '23505') throw new Error(iErr.message)
    }
    const linkCount = await getLinkCount(db, mentorId)

    // 5) 봇 주인에게 알림 (앱 안 알림 + 푸시). 실패해도 연동은 성공이다
    let notified = false
    if (notify && mentor.ownerUserId) {
        notified = await notifyOwner(db, {
            ownerUserId: mentor.ownerUserId, mentorId, botName: mentor.name,
            linkerName: user.displayName, total: linkCount,
        })
    }
    return { status: 'linked', linkCount, teamBotId: (tb as { id: string }).id, notified }
}

/** 봇 주인에게 「○○님이 [봇]을 팀에 넣었어요 (누적 N명)」. 앱 안 알림 한 줄 + 푸시(기존 관문) */
async function notifyOwner(db: SupabaseClient, p: { ownerUserId: string; mentorId: string; botName: string; linkerName: string; total: number }): Promise<boolean> {
    const text = linkNoticeText(p.linkerName, p.botName, p.total)
    let ok = false
    try {
        const { error } = await db.from('notifications').insert({ user_id: p.ownerUserId, mentor_id: p.mentorId, type: 'system', message: text })
        ok = !error
    } catch { /* 알림 표가 없어도 연동은 성공 */ }
    try {
        const out = await dispatchWith(db, {
            audience: 'self',
            message: { channel: 'push', userId: p.ownerUserId, subject: '큐리AI', body: text, url: `/mentors/${p.mentorId}` },
        })
        ok = ok || out.status === 'sent'
    } catch (e) {
        console.warn('[team-link] 푸시 실패', e instanceof Error ? e.message : e)
    }
    return ok
}

/** 연동 해제 = 내 팀에서 뺀다. 봇의 몸(mentors)과 대화 기록은 남는다. 기록은 active=false */
export async function unlinkMarketBot(db: SupabaseClient, userId: string, mentorId: string): Promise<{ removed: boolean; linkCount: number }> {
    const { data, error } = await db
        .from('team_bots')
        .delete()
        .eq('user_id', userId)
        .eq('mentor_id', mentorId)
        .select('id')
    if (error) throw new Error(error.message)
    // 트리거가 없어도(마이그레이션 일부만 적용) 기록이 맞게 여기서도 끈다
    await db.from('bot_links').update({ active: false }).eq('mentor_id', mentorId).eq('user_id', userId).eq('active', true)
    return { removed: (data ?? []).length > 0, linkCount: await getLinkCount(db, mentorId) }
}

/** 리더 대시보드: 내가 만든 봇마다 연동 수 · 이번 달 신규 */
export async function listOwnerBotLinkStats(db: SupabaseClient, userId: string): Promise<OwnerBotLinkStat[]> {
    const { data: cp } = await db.from('creator_profiles').select('id').eq('user_id', userId).maybeSingle()
    const creatorId = (cp as { id: string } | null)?.id
    if (!creatorId) return []
    const { data: mentors } = await db
        .from('mentors')
        .select('id, name')
        .eq('creator_id', creatorId)
        .neq('status', 'suspended')
        .order('created_at', { ascending: false })
    const rows = (mentors ?? []) as { id: string; name: string }[]
    const counts = await getLinkCounts(db, rows.map(r => r.id))
    return rows.map(r => ({
        mentorId: r.id, name: r.name,
        linkCount: counts.get(r.id)?.linkCount ?? 0,
        monthNew: counts.get(r.id)?.monthNew ?? 0,
    }))
}
