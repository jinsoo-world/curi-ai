// domains/os — 봇 신고 (서버 전용). 애플 심사 지침 1.2 (1002, 리뷰 반영 2차).
//
// 신고 = bot_reports 한 줄. 로그인 회원 또는 손님(visitorId). 인터넷 주소는 소금 친 sha256 지문(ip_hash)만 남긴다.
// 자동 내림 = 7일 안 「로그인 회원」 서로 다른 3명 + 그 신고들의 서로 다른 주소 지문 3개 이상일 때만.
//   손님 신고는 관리자 목록에만 간다(방문자 id 를 바꿔 여러 명인 척할 수 있다).
//   주인 없는 봇(creator_id 없음), 시연 봇(os-demo-*, 둘러보기 팀), 예시 봇은 자동으로 안 내린다 = 목록에만.
//   관리자가 닫은(dismissed) 신고를 낸 회원은 그 봇에 대해 30일 동안 다시 세지 않는다.
//   내리면 공개 관문(publish-gate.unpublishForReports)이 묶는다 = 주인이 다시 공개 못 한다. 지우지 않는다.
// 차단은 blocks.ts (가벼운 조각). 여기서 다시 내보낸다.

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { unpublishForReports, unpublishByAdmin, decideReview, releaseHold, isBotHeld, REPORT_REVIEW_CATEGORY } from './publish-gate'
import { openReviewOf } from './moderation'
import { isDemoMentor, isSampleMarketBot } from './showcase'
import { ReportTableMissing, isTableMissing } from './blocks'

export { ReportTableMissing, listBlockedMentorIds, isBotBlocked, withoutBlocked, blockBot, unblockBot, listBlockedBots } from './blocks'
export type { BlockedBot } from './blocks'

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
export const AUTO_UNPUBLISH_IPS = 3
export const AUTO_UNPUBLISH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** 관리자가 닫은 신고자를 다시 세지 않는 기간 */
export const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000
export const MAX_EXCERPT_CHARS = 1000
export const MAX_DETAIL_CHARS = 500

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEMO_SLUG_PREFIX = 'os-demo-'

export function isMentorId(v: unknown): v is string {
    return typeof v === 'string' && UUID_RE.test(v)
}

/** 인터넷 주소 지문. 소금 = REPORT_IP_SALT, 없으면 서버 비밀 열쇠에서 만든다(평문 주소는 어디에도 안 남긴다) */
export function hashIp(ip: string | null | undefined, salt = reportIpSalt()): string | null {
    const t = (ip ?? '').trim()
    if (!t || t === 'unknown') return null
    return createHash('sha256').update(`${salt}|${t}`).digest('hex')
}

function reportIpSalt(): string {
    const s = process.env.REPORT_IP_SALT?.trim()
    if (s) return s
    return createHash('sha256').update(`report-ip:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'curi-ai'}`).digest('hex')
}

/** 요청의 인터넷 주소 (rate-limit 과 같은 머리글) */
export function requestIp(req: Request): string | null {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
}

export interface ReportInput { mentorId: string; reason: ReportReason; detail: string | null; messageExcerpt: string | null; messageId: string | null }

/** 신고 몸통 검사. 발췌는 길면 자르고, 자세한 설명은 길면 거절한다. 메시지 id 는 uuid 일 때만 쓴다 */
export function parseReportBody(body: unknown): { ok: true; value: ReportInput } | { ok: false; error: string } {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    if (!isMentorId(b.mentorId)) return { ok: false, error: '어느 봇인지 알 수 없어요' }
    if (typeof b.reason !== 'string' || !(REPORT_REASONS as readonly string[]).includes(b.reason)) return { ok: false, error: '신고 이유를 골라 주세요' }
    if (b.detail !== undefined && b.detail !== null && typeof b.detail !== 'string') return { ok: false, error: '자세한 내용은 글로 적어 주세요' }
    const detail = typeof b.detail === 'string' ? b.detail.trim() : ''
    if (detail.length > MAX_DETAIL_CHARS) return { ok: false, error: `자세한 내용은 ${MAX_DETAIL_CHARS}자까지 적을 수 있어요` }
    if (b.messageExcerpt !== undefined && b.messageExcerpt !== null && typeof b.messageExcerpt !== 'string') return { ok: false, error: '메시지 형식이 맞지 않아요' }
    const excerpt = typeof b.messageExcerpt === 'string' ? b.messageExcerpt.trim().slice(0, MAX_EXCERPT_CHARS) : ''
    return {
        ok: true,
        value: {
            mentorId: b.mentorId, reason: b.reason as ReportReason, detail: detail || null, messageExcerpt: excerpt || null,
            messageId: isMentorId(b.messageId) ? b.messageId : null,
        },
    }
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
    reporter_visitor_id?: string | null
    ip_hash?: string | null
    mentor_id?: string
    reason?: string
    detail?: string | null
    message_excerpt?: string | null
    excerpt_source?: string | null
    status?: string
    created_at: string
}

/** 관리자 목록에서 「사람 수」: 회원은 회원 id, 손님은 방문자 id */
function reporterKey(r: Pick<ReportRow, 'reporter_user_id' | 'reporter_visitor_id'>): string | null {
    if (r.reporter_user_id) return `u:${r.reporter_user_id}`
    if (r.reporter_visitor_id) return `v:${r.reporter_visitor_id}`
    return null
}

/** 자동 내림에 세는 것 = 창 안의 열린 「회원」 신고만. 서로 다른 회원 수, 그 신고들의 서로 다른 주소 지문 수 */
export function countAutoReporters(rows: ReportRow[], nowMs: number, excludedUsers: Set<string> = new Set(), windowMs = AUTO_UNPUBLISH_WINDOW_MS): { users: number; ips: number } {
    const since = nowMs - windowMs
    const users = new Set<string>()
    const ips = new Set<string>()
    for (const r of rows) {
        if (r.status && r.status !== 'open') continue
        if (!r.reporter_user_id || excludedUsers.has(r.reporter_user_id)) continue
        if (Date.parse(r.created_at) < since) continue
        users.add(r.reporter_user_id)
        if (r.ip_hash) ips.add(r.ip_hash)
    }
    return { users: users.size, ips: ips.size }
}

export function shouldAutoUnpublish(rows: ReportRow[], nowMs: number, excludedUsers?: Set<string>): boolean {
    const c = countAutoReporters(rows, nowMs, excludedUsers)
    return c.users >= AUTO_UNPUBLISH_REPORTERS && c.ips >= AUTO_UNPUBLISH_IPS
}

/** 자동으로 내려도 되는 봇인가: 주인 있음, 시연 봇 아님, 예시 봇 아님 */
export function autoUnpublishEligible(m: { id: string; creator_id: string | null; slug: string | null } | null): boolean {
    if (!m || !m.creator_id) return false
    if ((m.slug ?? '').startsWith(DEMO_SLUG_PREFIX)) return false
    if (isDemoMentor(m.id) || isSampleMarketBot(m.id)) return false
    return true
}

export async function mentorExists(db: SupabaseClient, mentorId: string): Promise<boolean> {
    const { data } = await db.from('mentors').select('id').eq('id', mentorId).maybeSingle()
    return !!data
}

/**
 * 신고한 말을 서버에서 꺼낸다: 내 1:1 대화(messages → chat_sessions 주인, 봇) 또는 내 단체방(channel_messages → channels 주인)의 그 봇 말.
 * 못 찾으면 null (신고자가 보낸 인용을 쓴다)
 */
async function findReportedMessage(db: SupabaseClient, userId: string, mentorId: string, messageId: string): Promise<string | null> {
    try {
        const { data: m } = await db.from('messages').select('session_id, role, content').eq('id', messageId).maybeSingle()
        const msg = m as { session_id: string; role: string; content: string | null } | null
        if (msg && msg.role === 'assistant') {
            const { data: s } = await db.from('chat_sessions').select('user_id, mentor_id').eq('id', msg.session_id).maybeSingle()
            const ses = s as { user_id: string; mentor_id: string } | null
            if (ses && ses.user_id === userId && ses.mentor_id === mentorId) return (msg.content ?? '').slice(0, MAX_EXCERPT_CHARS)
        }
        const { data: c } = await db.from('channel_messages').select('channel_id, author_kind, mentor_id, content').eq('id', messageId).maybeSingle()
        const cm = c as { channel_id: string; author_kind: string; mentor_id: string | null; content: string | null } | null
        if (cm && cm.author_kind === 'bot' && cm.mentor_id === mentorId) {
            const { data: ch } = await db.from('channels').select('user_id').eq('id', cm.channel_id).maybeSingle()
            if ((ch as { user_id: string } | null)?.user_id === userId) return (cm.content ?? '').slice(0, MAX_EXCERPT_CHARS)
        }
    } catch (e) {
        console.error('[os/reports] 신고한 말 찾기 실패', e instanceof Error ? e.message : e)
    }
    return null
}

/** 관리자가 30일 안에 닫은 신고를 낸 회원 (이 봇) */
async function cooledDownUsers(db: SupabaseClient, mentorId: string, nowMs: number): Promise<Set<string>> {
    const { data, error } = await db.from('bot_reports').select('reporter_user_id')
        .eq('mentor_id', mentorId).eq('status', 'dismissed').gte('handled_at', new Date(nowMs - DISMISS_COOLDOWN_MS).toISOString())
    if (error) throw new Error(error.message)
    return new Set(((data ?? []) as { reporter_user_id: string | null }[]).map(r => r.reporter_user_id).filter((v): v is string => !!v))
}

/**
 * 신고 한 건 넣기 → 자동 내림 기준을 넘으면 공개 관문으로 내리고 묶는다.
 * 없는 봇이면 아무것도 안 하고 조용히 끝난다(있는지 없는지 새지 않게). 내리기가 실패해도 신고는 남는다.
 */
export async function submitReport(
    db: SupabaseClient,
    a: ReportInput & { reporterUserId: string | null; reporterVisitorId: string | null; ipHash: string | null },
    nowMs = Date.now(),
): Promise<{ saved: boolean; autoUnpublished: boolean }> {
    const { data: mRow } = await db.from('mentors').select('id, creator_id, slug').eq('id', a.mentorId).maybeSingle()
    const mentor = mRow as { id: string; creator_id: string | null; slug: string | null } | null
    if (!mentor) return { saved: false, autoUnpublished: false }

    const serverText = a.reporterUserId && a.messageId ? await findReportedMessage(db, a.reporterUserId, a.mentorId, a.messageId) : null
    const excerpt = serverText ?? a.messageExcerpt
    const { error } = await db.from('bot_reports').insert({
        reporter_user_id: a.reporterUserId, reporter_visitor_id: a.reporterUserId ? null : a.reporterVisitorId,
        ip_hash: a.ipHash, mentor_id: a.mentorId, reason: a.reason, detail: a.detail,
        message_excerpt: excerpt, excerpt_source: excerpt ? (serverText ? 'server' : 'reporter') : null,
    })
    if (error) { if (isTableMissing(error)) throw new ReportTableMissing(); throw new Error(error.message) }

    // 손님 신고 = 관리자 목록에만. 자동으로 내리면 안 되는 봇도 목록에만
    if (!a.reporterUserId || !autoUnpublishEligible(mentor)) return { saved: true, autoUnpublished: false }
    try {
        const since = new Date(nowMs - AUTO_UNPUBLISH_WINDOW_MS).toISOString()
        const { data, error: readErr } = await db.from('bot_reports')
            .select('reporter_user_id, ip_hash, status, created_at')
            .eq('mentor_id', a.mentorId).eq('status', 'open').gte('created_at', since)
        if (readErr) throw new Error(readErr.message)
        const rows = (data ?? []) as ReportRow[]
        const excluded = await cooledDownUsers(db, a.mentorId, nowMs)
        if (!shouldAutoUnpublish(rows, nowMs, excluded)) return { saved: true, autoUnpublished: false }
        const did = await unpublishForReports(db, a.mentorId, countAutoReporters(rows, nowMs, excluded).users)
        return { saved: true, autoUnpublished: did }
    } catch (e) {
        console.error('[os/reports] 자동 내리기 확인 실패', e instanceof Error ? e.message : e)
        return { saved: true, autoUnpublished: false }
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
    items: {
        id: string; reason: string; label: string; detail: string | null; excerpt: string | null
        /** true = 서버가 꺼낸 진짜 봇 말, false = 신고자가 보낸 인용 */
        excerptFromServer: boolean
        /** 손님 신고 (자동 내림에 안 셈) */
        guest: boolean
        createdAt: string
    }[]
}

/** 관리자 목록: 열린 신고를 봇마다 묶는다 (최근 신고가 있는 봇이 위) */
export function groupReports(rows: ReportRow[], mentors: Map<string, { name: string | null; title: string | null; is_active: boolean | null }>): ReportGroup[] {
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
        const people = new Set(sorted.map(reporterKey).filter(Boolean))
        const m = mentors.get(mentorId)
        out.push({
            mentorId,
            name: m?.name ?? '사라진 봇',
            title: m?.title ?? '',
            isActive: !!m?.is_active,
            count: sorted.length,
            reporterCount: people.size,
            reasons: [...reasonCount].sort((x, y) => y[1] - x[1]).map(([reason, count]) => ({ reason, label: REPORT_REASON_LABELS[reason as ReportReason] ?? reason, count })),
            latestAt: sorted[0]!.created_at,
            items: sorted.slice(0, 20).map(r => ({
                id: r.id ?? '', reason: r.reason ?? 'other', label: REPORT_REASON_LABELS[(r.reason ?? 'other') as ReportReason] ?? String(r.reason),
                detail: r.detail ?? null, excerpt: r.message_excerpt ?? null, excerptFromServer: r.excerpt_source === 'server',
                guest: !r.reporter_user_id, createdAt: r.created_at,
            })),
        })
    }
    return out.sort((x, y) => (x.latestAt < y.latestAt ? 1 : -1))
}

export async function listOpenReportGroups(db: SupabaseClient): Promise<ReportGroup[]> {
    const { data, error } = await db.from('bot_reports')
        .select('id, reporter_user_id, reporter_visitor_id, mentor_id, reason, detail, message_excerpt, excerpt_source, status, created_at')
        .eq('status', 'open').order('created_at', { ascending: false }).limit(1000)
    if (error) { if (isTableMissing(error)) throw new ReportTableMissing(); throw new Error(error.message) }
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
 *   dismiss   = 신고가 맞지 않다. 신고만 닫는다 (그 신고자들은 30일 동안 이 봇에 대해 자동 내림에 안 센다)
 *   unpublish = 봇을 내리고 묶는다(공개 관문). 신고는 조치됨
 *   keep      = 봇을 그대로 둔다. 신고를 닫고 묶음을 푼다. 신고 때문에 자동으로 내려갔으면 관문 승인으로 다시 공개한다
 *               시연 봇은 공개 상태를 건드리지 않는다(안내만)
 */
export async function handleReports(
    db: SupabaseClient, adminUserId: string, mentorId: string, action: ReportAction,
): Promise<{ closed: number; republished: boolean; note?: string }> {
    let republished = false
    let note: string | undefined
    if (action === 'unpublish') await unpublishByAdmin(db, adminUserId, mentorId)
    if (action === 'keep') {
        const { data: m } = await db.from('mentors').select('slug').eq('id', mentorId).maybeSingle()
        const slug = (m as { slug: string | null } | null)?.slug ?? ''
        if (slug.startsWith(DEMO_SLUG_PREFIX) || isDemoMentor(mentorId)) {
            note = '시연용 봇은 공개 상태를 바꾸지 않아요. 신고만 닫았어요'
        } else {
            const open = await openReviewOf(db, mentorId)
            if (open && open.categories.includes(REPORT_REVIEW_CATEGORY)) {
                const r = await decideReview(db, adminUserId, mentorId, 'approve')
                republished = r.status === 'approved' || r.moderation?.verdict === 'pass'
            } else if (await isBotHeld(db, mentorId)) {
                await releaseHold(db, adminUserId, mentorId)
            }
        }
    }
    const { data, error } = await db.from('bot_reports')
        .update({ status: action === 'unpublish' ? 'actioned' : 'dismissed', handled_at: new Date().toISOString(), handled_by: adminUserId })
        .eq('mentor_id', mentorId).eq('status', 'open').select('id')
    if (error) { if (isTableMissing(error)) throw new ReportTableMissing(); throw new Error(error.message) }
    return { closed: ((data ?? []) as unknown[]).length, republished, ...(note ? { note } : {}) }
}
