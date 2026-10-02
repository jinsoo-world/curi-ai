// domains/os — 봇 신고, 봇 차단 (서버 전용). 애플 심사 지침 1.2 (1002).
//
// 신고 = bot_reports 한 줄. 로그인 회원 또는 손님(visitorId). 7일 안에 서로 다른 신고자 3명이 열린 신고를 넣으면
//   공개 관문(publish-gate.unpublishForReports)으로 봇을 내리고 관리자 확인 대기에 올린다. 지우지 않는다.
// 차단 = user_bot_blocks 한 줄. 그 회원에게만 마켓, 팀 목록, 1:1 대화, 그룹방에서 빠진다.
// 표가 아직 없으면(마이그레이션 전) 차단 목록은 빈 것으로 본다 = 대화가 멈추지 않는다. 신고, 차단 쓰기는 503.

import type { SupabaseClient } from '@supabase/supabase-js'
import { unpublishForReports, unpublishByAdmin, decideReview, REPORT_REVIEW_CATEGORY } from './publish-gate'
import { openReviewOf } from './moderation'

export const REPORT_REASONS = ['spam', 'sexual', 'hate', 'violence', 'impersonation', 'personal_info', 'misinformation', 'other'] as const
export type ReportReason = typeof REPORT_REASONS[number]

/** 화면에 보이는 이름 (관리자 화면, 앱과 같은 글) */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
    spam: '스팸, 광고', sexual: '성적인 내용', hate: '혐오, 차별', violence: '폭력',
    impersonation: '다른 사람인 척', personal_info: '개인정보 노출', misinformation: '잘못된 정보', other: '기타',
}

/** 차단한 봇에게 말을 걸었을 때 (1:1 대화) */
export const BLOCKED_CHAT_TEXT = '차단한 봇이에요. 설정의 「차단한 봇」에서 해제하면 다시 대화할 수 있어요'

export const AUTO_UNPUBLISH_REPORTERS = 3
export const AUTO_UNPUBLISH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_EXCERPT_CHARS = 1000
export const MAX_DETAIL_CHARS = 500

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TABLE_MISSING = new Set(['42P01', 'PGRST205'])

export class ReportTableMissing extends Error {
    constructor() { super('신고 표가 아직 준비되지 않았어요') }
}

export function isMentorId(v: unknown): v is string {
    return typeof v === 'string' && UUID_RE.test(v)
}

export interface ReportInput { mentorId: string; reason: ReportReason; detail: string | null; messageExcerpt: string | null }

/** 신고 몸통 검사. 발췌는 길면 자르고, 자세한 설명은 길면 거절한다 */
export function parseReportBody(body: unknown): { ok: true; value: ReportInput } | { ok: false; error: string } {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    if (!isMentorId(b.mentorId)) return { ok: false, error: '어느 봇인지 알 수 없어요' }
    if (typeof b.reason !== 'string' || !(REPORT_REASONS as readonly string[]).includes(b.reason)) return { ok: false, error: '신고 이유를 골라 주세요' }
    if (b.detail !== undefined && b.detail !== null && typeof b.detail !== 'string') return { ok: false, error: '자세한 내용은 글로 적어 주세요' }
    const detail = typeof b.detail === 'string' ? b.detail.trim() : ''
    if (detail.length > MAX_DETAIL_CHARS) return { ok: false, error: `자세한 내용은 ${MAX_DETAIL_CHARS}자까지 적을 수 있어요` }
    if (b.messageExcerpt !== undefined && b.messageExcerpt !== null && typeof b.messageExcerpt !== 'string') return { ok: false, error: '메시지 형식이 맞지 않아요' }
    const excerpt = typeof b.messageExcerpt === 'string' ? b.messageExcerpt.trim().slice(0, MAX_EXCERPT_CHARS) : ''
    return { ok: true, value: { mentorId: b.mentorId, reason: b.reason as ReportReason, detail: detail || null, messageExcerpt: excerpt || null } }
}

/** 손님 방문자 id 다듬기 (대화와 같은 값). 없거나 이상하면 null */
export function cleanVisitorId(v: unknown): string | null {
    if (typeof v !== 'string') return null
    const t = v.trim()
    if (!t || t.length > 64 || !/^[\w.:-]+$/.test(t)) return null
    return t
}

export interface ReportRow {
    id?: string
    reporter_user_id: string | null
    reporter_visitor_id: string | null
    mentor_id?: string
    reason?: string
    detail?: string | null
    message_excerpt?: string | null
    status?: string
    created_at: string
}

/** 같은 사람 판정 열쇠: 회원은 회원 id, 손님은 방문자 id */
export function reporterKey(r: Pick<ReportRow, 'reporter_user_id' | 'reporter_visitor_id'>): string | null {
    if (r.reporter_user_id) return `u:${r.reporter_user_id}`
    if (r.reporter_visitor_id) return `v:${r.reporter_visitor_id}`
    return null
}

/** 창 안(기본 7일)의 열린 신고를 넣은 서로 다른 신고자 수 */
export function countDistinctReporters(rows: ReportRow[], nowMs: number, windowMs = AUTO_UNPUBLISH_WINDOW_MS): number {
    const since = nowMs - windowMs
    const keys = new Set<string>()
    for (const r of rows) {
        if (r.status && r.status !== 'open') continue
        if (Date.parse(r.created_at) < since) continue
        const k = reporterKey(r)
        if (k) keys.add(k)
    }
    return keys.size
}

export function shouldAutoUnpublish(rows: ReportRow[], nowMs: number): boolean {
    return countDistinctReporters(rows, nowMs) >= AUTO_UNPUBLISH_REPORTERS
}

function missing(error: { code?: string } | null | undefined): boolean {
    return !!error?.code && TABLE_MISSING.has(error.code)
}

/** 이 회원이 차단한 봇 id. 실패하면 빈 것(막지 않는다) */
export async function listBlockedMentorIds(db: SupabaseClient, userId: string | null | undefined): Promise<Set<string>> {
    if (!userId) return new Set()
    try {
        const { data, error } = await db.from('user_bot_blocks').select('mentor_id').eq('user_id', userId)
        if (error) {
            if (!missing(error)) console.error('[os/reports] 차단 목록 읽기 실패', error.message)
            return new Set()
        }
        return new Set(((data ?? []) as { mentor_id: string }[]).map(r => r.mentor_id))
    } catch (e) {
        console.error('[os/reports] 차단 목록 읽기 실패', e instanceof Error ? e.message : e)
        return new Set()
    }
}

export async function isBotBlocked(db: SupabaseClient, userId: string | null | undefined, mentorId: string): Promise<boolean> {
    if (!userId) return false
    return (await listBlockedMentorIds(db, userId)).has(mentorId)
}

/** 목록에서 차단한 봇을 뺀다 */
export function withoutBlocked<T>(items: T[], blocked: Set<string>, idOf: (t: T) => string): T[] {
    if (blocked.size === 0) return items
    return items.filter(t => !blocked.has(idOf(t)))
}

export async function mentorExists(db: SupabaseClient, mentorId: string): Promise<boolean> {
    const { data } = await db.from('mentors').select('id').eq('id', mentorId).maybeSingle()
    return !!data
}

export async function blockBot(db: SupabaseClient, userId: string, mentorId: string): Promise<void> {
    const { error } = await db.from('user_bot_blocks').upsert({ user_id: userId, mentor_id: mentorId }, { onConflict: 'user_id,mentor_id', ignoreDuplicates: true })
    if (error) { if (missing(error)) throw new ReportTableMissing(); throw new Error(error.message) }
}

export async function unblockBot(db: SupabaseClient, userId: string, mentorId: string): Promise<void> {
    const { error } = await db.from('user_bot_blocks').delete().eq('user_id', userId).eq('mentor_id', mentorId)
    if (error) { if (missing(error)) throw new ReportTableMissing(); throw new Error(error.message) }
}

export interface BlockedBot { mentorId: string; name: string; avatarUrl: string | null; blockedAt: string | null }

/** 설정 「차단한 봇」 목록 (이름, 사진 같이) */
export async function listBlockedBots(db: SupabaseClient, userId: string): Promise<BlockedBot[]> {
    const { data, error } = await db.from('user_bot_blocks').select('mentor_id, created_at').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) { if (missing(error)) return []; throw new Error(error.message) }
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

/**
 * 신고 한 건 넣기 → 7일 안 서로 다른 신고자가 3명 이상이면 자동으로 내린다.
 * 내리기가 실패해도 신고는 남는다(던지지 않고 로그만).
 */
export async function submitReport(
    db: SupabaseClient,
    a: ReportInput & { reporterUserId: string | null; reporterVisitorId: string | null },
    nowMs = Date.now(),
): Promise<{ autoUnpublished: boolean }> {
    const { error } = await db.from('bot_reports').insert({
        reporter_user_id: a.reporterUserId, reporter_visitor_id: a.reporterUserId ? null : a.reporterVisitorId,
        mentor_id: a.mentorId, reason: a.reason, detail: a.detail, message_excerpt: a.messageExcerpt,
    })
    if (error) { if (missing(error)) throw new ReportTableMissing(); throw new Error(error.message) }

    try {
        const since = new Date(nowMs - AUTO_UNPUBLISH_WINDOW_MS).toISOString()
        const { data, error: readErr } = await db.from('bot_reports')
            .select('reporter_user_id, reporter_visitor_id, status, created_at')
            .eq('mentor_id', a.mentorId).eq('status', 'open').gte('created_at', since)
        if (readErr) throw new Error(readErr.message)
        const rows = (data ?? []) as ReportRow[]
        if (!shouldAutoUnpublish(rows, nowMs)) return { autoUnpublished: false }
        const did = await unpublishForReports(db, a.mentorId, countDistinctReporters(rows, nowMs))
        return { autoUnpublished: did }
    } catch (e) {
        console.error('[os/reports] 자동 내리기 확인 실패', e instanceof Error ? e.message : e)
        return { autoUnpublished: false }
    }
}

export interface ReportGroup {
    mentorId: string
    name: string
    title: string
    isActive: boolean
    count: number
    reporterCount: number
    reasons: { reason: string; label: string; count: number }[]
    latestAt: string
    items: { id: string; reason: string; label: string; detail: string | null; excerpt: string | null; createdAt: string }[]
}

/** 관리자 목록: 열린 신고를 봇마다 묶는다 (최근 신고가 있는 봇이 위) */
export function groupReports(rows: ReportRow[], mentors: Map<string, { name: string | null; title: string | null; is_active: boolean | null }>, nowMs = Date.now()): ReportGroup[] {
    const by = new Map<string, ReportRow[]>()
    for (const r of rows) {
        if (!r.mentor_id) continue
        const list = by.get(r.mentor_id) ?? []
        list.push(r)
        by.set(r.mentor_id, list)
    }
    const out: ReportGroup[] = []
    for (const [mentorId, list] of by) {
        const sorted = [...list].sort((x, y) => (x.created_at < y.created_at ? 1 : -1))
        const reasonCount = new Map<string, number>()
        for (const r of sorted) reasonCount.set(r.reason ?? 'other', (reasonCount.get(r.reason ?? 'other') ?? 0) + 1)
        const m = mentors.get(mentorId)
        out.push({
            mentorId,
            name: m?.name ?? '사라진 봇',
            title: m?.title ?? '',
            isActive: !!m?.is_active,
            count: sorted.length,
            reporterCount: countDistinctReporters(sorted, nowMs, Number.POSITIVE_INFINITY),
            reasons: [...reasonCount].sort((x, y) => y[1] - x[1]).map(([reason, count]) => ({ reason, label: REPORT_REASON_LABELS[reason as ReportReason] ?? reason, count })),
            latestAt: sorted[0]!.created_at,
            items: sorted.slice(0, 20).map(r => ({
                id: r.id ?? '', reason: r.reason ?? 'other', label: REPORT_REASON_LABELS[(r.reason ?? 'other') as ReportReason] ?? String(r.reason),
                detail: r.detail ?? null, excerpt: r.message_excerpt ?? null, createdAt: r.created_at,
            })),
        })
    }
    return out.sort((x, y) => (x.latestAt < y.latestAt ? 1 : -1))
}

export async function listOpenReportGroups(db: SupabaseClient): Promise<ReportGroup[]> {
    const { data, error } = await db.from('bot_reports')
        .select('id, reporter_user_id, reporter_visitor_id, mentor_id, reason, detail, message_excerpt, status, created_at')
        .eq('status', 'open').order('created_at', { ascending: false }).limit(1000)
    if (error) { if (missing(error)) throw new ReportTableMissing(); throw new Error(error.message) }
    const rows = (data ?? []) as ReportRow[]
    if (rows.length === 0) return []
    const ids = [...new Set(rows.map(r => r.mentor_id!).filter(Boolean))]
    const { data: ms } = await db.from('mentors').select('id, name, title, is_active').in('id', ids)
    const map = new Map(((ms ?? []) as { id: string; name: string | null; title: string | null; is_active: boolean | null }[]).map(m => [m.id, m]))
    return groupReports(rows, map)
}

export type ReportAction = 'dismiss' | 'unpublish' | 'keep'

/**
 * 관리자 조치 (봇 하나의 열린 신고 전부).
 *   dismiss   = 신고가 맞지 않다. 신고만 닫는다 (자동으로 내려간 봇은 확인 대기에 그대로 남는다)
 *   unpublish = 봇을 내린다(공개 관문). 신고는 조치됨
 *   keep      = 봇을 그대로 둔다. 신고를 닫고, 신고 때문에 자동으로 내려갔으면 다시 공개한다(관문의 승인)
 */
export async function handleReports(db: SupabaseClient, adminUserId: string, mentorId: string, action: ReportAction): Promise<{ closed: number; republished: boolean }> {
    let republished = false
    if (action === 'unpublish') await unpublishByAdmin(db, adminUserId, mentorId)
    if (action === 'keep') {
        const open = await openReviewOf(db, mentorId)
        if (open && open.categories.includes(REPORT_REVIEW_CATEGORY)) {
            const r = await decideReview(db, adminUserId, mentorId, 'approve')
            republished = r.status === 'approved' || r.moderation?.verdict === 'pass'
        }
    }
    const { data, error } = await db.from('bot_reports')
        .update({ status: action === 'unpublish' ? 'actioned' : 'dismissed', handled_at: new Date().toISOString(), handled_by: adminUserId })
        .eq('mentor_id', mentorId).eq('status', 'open').select('id')
    if (error) { if (missing(error)) throw new ReportTableMissing(); throw new Error(error.message) }
    return { closed: ((data ?? []) as unknown[]).length, republished }
}
