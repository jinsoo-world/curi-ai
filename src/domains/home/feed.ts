// domains/home: /home 「지금 만들어지는 AI」 줄과 누적 숫자 (0단계: 실제 활동만).
// 대표 지시 0928 23:53. 예시 줄, 지어낸 숫자는 절대 넣지 않는다. 기준보다 적으면 통째로 숨긴다.
// 돈 이야기(leader_earnings)는 읽지 않는다. 표를 새로 만들지 않고 있는 표만 읽는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { JOBS } from '@/domains/os/presets'

/** 숨김 기준 (여기 숫자만 바꾸면 된다) */
export const HOME_FEED_CONFIG = {
    /** 최근 24시간에 활동한 서로 다른 사람이 이보다 적으면 줄을 숨긴다 */
    minPeople24h: 5,
    /** 최근 24시간 활동 줄이 이보다 적으면 줄을 숨긴다 */
    minRows24h: 5,
    /** 보여 줄 가장 오래된 활동 */
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    /** 한 번에 보여 줄 줄 */
    maxRows: 12,
    /** 가입 때 자동으로 생기는 기본 팀: 그 사람의 첫 봇과 이 시간 안에 생긴 봇은 뺀다 */
    defaultTeamWindowMs: 120 * 1000,
    /** 누적 숫자: 만든 AI 가 이보다 적으면 그 숫자를 숨긴다 */
    minTotalBots: 100,
    /** 누적 숫자: 대화방이 이보다 적으면 그 숫자를 숨긴다 */
    minTotalChats: 1000,
} as const

export type HomeActivityKind = 'made' | 'linked' | 'chat'

export interface HomeActivityRow {
    kind: HomeActivityKind
    userId: string
    at: string
    /** 봇 이름 대신 보여 줄 갈래 */
    category: string
}

export interface HomeFeedItem {
    key: string
    text: string
    ago: string
}

export interface HomeStats {
    bots: number | null
    chats: number | null
}

/** 「김**님」. 이름이 없거나 이상하면 「누군가」 */
export function maskName(name: string | null | undefined): string {
    const t = String(name ?? '').trim().replace(/\s+/g, '')
    if (!t || t.includes('@')) return '누군가'
    const first = Array.from(t)[0]
    return `${first}**님`
}

/** 「방금」「5분 전」「3시간 전」「2일 전」 */
export function agoText(at: string | number | Date, now = Date.now()): string {
    const ms = now - new Date(at).getTime()
    if (!Number.isFinite(ms) || ms < 60_000) return '방금'
    const min = Math.floor(ms / 60_000)
    if (min < 60) return `${min}분 전`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}시간 전`
    return `${Math.floor(h / 24)}일 전`
}

const JOB_BY_LINER = new Map(JOBS.filter(j => j.oneLiner).map(j => [j.oneLiner, j.label]))
const SAFE_CATEGORY = /^[가-힣A-Za-z ]{1,8}$/

/** 봇 이름은 보여 주지 않는다. 할 일(프리셋), 나를 닮은 AI, 마켓 갈래 중 하나 */
export function categoryOf(b: { role?: string | null; oneLiner?: string | null; marketCategory?: string | null }): string {
    if (b.role === 'twin') return '나를 닮은 AI'
    const job = b.oneLiner ? JOB_BY_LINER.get(b.oneLiner) : undefined
    if (job) return job
    const c = String(b.marketCategory ?? '').trim()
    if (c && SAFE_CATEGORY.test(c) && c !== '안내') return `${c} AI`
    return 'AI 팀원'
}

/** 받침 따라 을/를, 과/와. 영문(AI 등)으로 끝나면 받침 없음으로 본다 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
    const last = word.trim().slice(-1)
    const code = last.charCodeAt(0) - 0xac00
    const final = code >= 0 && code <= 11171 ? code % 28 !== 0 : false
    return `${word}${final ? withFinal : withoutFinal}`
}

function lineOf(kind: HomeActivityKind, who: string, category: string): string {
    if (kind === 'made') return `${who}이 ${josa(category, '을', '를')} 만들었어요`
    if (kind === 'linked') return `${who}이 ${josa(category, '을', '를')} 팀에 들였어요`
    return `${who}이 ${josa(category, '과', '와')} 대화를 시작했어요`
}

/**
 * 실제 활동 줄 → 보여 줄 줄. 기준보다 적으면 빈 배열 (줄을 통째로 숨긴다).
 * 한 사람의 같은 종류 활동은 가장 최근 하나만 남긴다.
 */
export function buildHomeFeed(rows: HomeActivityRow[], names: Map<string, string | null>, now = Date.now(), cfg = HOME_FEED_CONFIG): HomeFeedItem[] {
    const fresh = rows
        .filter(r => r.userId && Number.isFinite(new Date(r.at).getTime()))
        .filter(r => { const age = now - new Date(r.at).getTime(); return age >= -60_000 && age <= cfg.maxAgeMs })
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    const seen = new Set<string>()
    const uniq = fresh.filter(r => { const k = `${r.userId}:${r.kind}`; if (seen.has(k)) return false; seen.add(k); return true })
    const day = uniq.filter(r => now - new Date(r.at).getTime() <= 24 * 60 * 60 * 1000)
    const people = new Set(day.map(r => r.userId)).size
    if (people < cfg.minPeople24h || day.length < cfg.minRows24h) return []
    return uniq.slice(0, cfg.maxRows).map(r => ({
        key: `${r.kind}:${r.userId}:${r.at}`,
        text: lineOf(r.kind, maskName(names.get(r.userId)), r.category),
        ago: agoText(r.at, now),
    }))
}

/** 누적 숫자: 기준보다 적은 것은 null (숨김) */
export function gateStats(raw: { bots: number; chats: number }, cfg = HOME_FEED_CONFIG): HomeStats {
    return {
        bots: raw.bots >= cfg.minTotalBots ? raw.bots : null,
        chats: raw.chats >= cfg.minTotalChats ? raw.chats : null,
    }
}

interface TeamBotRow { user_id: string; role: string | null; one_liner: string | null; created_at: string; linked_from_market: boolean | null }

/** 사람이 직접 만든 봇만 (마켓에서 들인 것, 가입 때 자동으로 생긴 기본 팀 제외) */
export function selfMadeBots(all: TeamBotRow[], windowMs = HOME_FEED_CONFIG.defaultTeamWindowMs): TeamBotRow[] {
    const first = new Map<string, number>()
    for (const b of all) {
        const t = new Date(b.created_at).getTime()
        const f = first.get(b.user_id)
        if (f === undefined || t < f) first.set(b.user_id, t)
    }
    return all.filter(b => !b.linked_from_market && new Date(b.created_at).getTime() - (first.get(b.user_id) ?? 0) > windowMs)
}

export interface HomeActivity { feed: HomeFeedItem[]; stats: HomeStats }

const EMPTY: HomeActivity = { feed: [], stats: { bots: null, chats: null } }

/** 서버에서만 부른다 (service role). 실패하면 조용히 전부 숨김 */
export async function loadHomeActivity(db: SupabaseClient, now = Date.now()): Promise<HomeActivity> {
    try {
        const since = new Date(now - HOME_FEED_CONFIG.maxAgeMs).toISOString()
        const [botsQ, linksQ, chatsQ, chatTotalQ, adminsQ] = await Promise.all([
            db.from('team_bots').select('user_id, role, one_liner, created_at, linked_from_market').order('created_at', { ascending: true }).limit(20000),
            db.from('bot_links').select('user_id, mentor_id, created_at').eq('active', true).gte('created_at', since).limit(500),
            db.from('chat_sessions').select('user_id, mentor_id, created_at').is('deleted_at', null).gt('message_count', 0).gte('created_at', since).order('created_at', { ascending: false }).limit(500),
            db.from('chat_sessions').select('id', { count: 'exact', head: true }).is('deleted_at', null).gt('message_count', 0),
            db.from('users').select('id').eq('role', 'admin').limit(200),
        ])
        if (botsQ.error || linksQ.error || chatsQ.error) return EMPTY
        const admins = new Set((adminsQ.data ?? []).map(u => u.id as string))
        const made = selfMadeBots((botsQ.data ?? []) as TeamBotRow[]).filter(b => !admins.has(b.user_id))
        const links = (linksQ.data ?? []).filter(l => !admins.has(l.user_id as string))
        const chats = (chatsQ.data ?? []).filter(c => !admins.has(c.user_id as string))

        const mentorIds = [...new Set([...links, ...chats].map(r => r.mentor_id as string).filter(Boolean))]
        const mentorsQ = mentorIds.length ? await db.from('mentors').select('id, category').in('id', mentorIds) : { data: [] as { id: string; category: string | null }[] }
        const teamQ = mentorIds.length ? await db.from('team_bots').select('mentor_id, role, one_liner').in('mentor_id', mentorIds).limit(2000) : { data: [] as { mentor_id: string; role: string | null; one_liner: string | null }[] }
        const cat = new Map<string, string | null>((mentorsQ.data ?? []).map(m => [m.id as string, (m.category as string | null) ?? null]))
        const team = new Map<string, { role: string | null; one_liner: string | null }>()
        for (const t of teamQ.data ?? []) if (!team.has(t.mentor_id as string)) team.set(t.mentor_id as string, t as { role: string | null; one_liner: string | null })
        const catOfMentor = (id: string) => categoryOf({ role: team.get(id)?.role, oneLiner: team.get(id)?.one_liner, marketCategory: cat.get(id) })

        const rows: HomeActivityRow[] = [
            ...made.filter(b => new Date(b.created_at).getTime() >= now - HOME_FEED_CONFIG.maxAgeMs)
                .map(b => ({ kind: 'made' as const, userId: b.user_id, at: b.created_at, category: categoryOf({ role: b.role, oneLiner: b.one_liner }) })),
            ...links.map(l => ({ kind: 'linked' as const, userId: l.user_id as string, at: l.created_at as string, category: catOfMentor(l.mentor_id as string) })),
            ...chats.map(c => ({ kind: 'chat' as const, userId: c.user_id as string, at: c.created_at as string, category: catOfMentor(c.mentor_id as string) })),
        ]
        const userIds = [...new Set(rows.map(r => r.userId))]
        const usersQ = userIds.length ? await db.from('users').select('id, display_name').in('id', userIds) : { data: [] as { id: string; display_name: string | null }[] }
        const names = new Map<string, string | null>((usersQ.data ?? []).map(u => [u.id as string, (u.display_name as string | null) ?? null]))

        return {
            feed: buildHomeFeed(rows, names, now),
            stats: gateStats({ bots: made.length, chats: chatTotalQ.count ?? 0 }),
        }
    } catch {
        return EMPTY
    }
}
