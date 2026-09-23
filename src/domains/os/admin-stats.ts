// domains/os/admin-stats — 관리자 「봇 OS」 화면의 숫자 계산 (순수 함수만. DB, 환경변수 안 만진다)
//
// 원칙
//  1. 표가 없으면(42P01) 그 칸은 null. 숫자 0 과 「모른다(null)」를 섞지 않는다.
//  2. 비율은 분모를 같이 적는다. 「3/10 (30.0%)」처럼.
//  3. 개인정보는 여기서 잘라 낸다(사용자 id 앞 8자, 요약 60자, 요청 제한 열쇠 마스킹). 본문, 이메일, 전화는 아예 받지 않는다.

export const TABLE_MISSING_CODE = '42P01'

/** 표가 없어서 생긴 오류인가 */
export function isTableMissing(error: { code?: string } | null | undefined): boolean {
    return !!error && error.code === TABLE_MISSING_CODE
}

/** 서울 기준 오늘 0시(UTC ISO). nowMs 를 받는 건 테스트 때문 */
export function startOfTodayKst(nowMs: number): string {
    const KST = 9 * 60 * 60 * 1000
    const kst = new Date(nowMs + KST)
    const dayStartKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate())
    return new Date(dayStartKst - KST).toISOString()
}

/** 서울 기준 오늘 날짜(YYYY-MM-DD). next_steps.due_on 비교용 */
export function todayKstDate(nowMs: number): string {
    return new Date(nowMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function daysAgoIso(nowMs: number, days: number): string {
    return new Date(nowMs - days * 86400000).toISOString()
}

/** 비율 = 분자/분모. 분모 0 이면 값 null, 글자는 「0/0 (—)」 */
export interface Ratio {
    num: number
    den: number
    pct: number | null
    label: string
}
export function ratio(num: number, den: number): Ratio {
    if (den <= 0) return { num, den, pct: null, label: `${num}/${den} (—)` }
    const pct = Math.round((num / den) * 1000) / 10
    return { num, den, pct, label: `${num}/${den} (${pct.toFixed(1)}%)` }
}

/** 사용자 id 앞 8자만 */
export function shortId(id: string | null | undefined): string {
    if (!id) return '—'
    return id.slice(0, 8)
}

/** 글자 자르기 (기본 60자). 넘치면 「…」 */
export function truncate(text: string | null | undefined, max = 60): string {
    if (!text) return ''
    const t = text.replace(/\s+/g, ' ').trim()
    return t.length > max ? t.slice(0, max) + '…' : t
}

/**
 * 요청 제한 열쇠 마스킹. 열쇠 모양 = prefix:kind:id (예 chat:u:uuid / chat:ip:1.2.3.4).
 * 앞 갈래는 남기고 id 는 앞 4자 + 「…」. 모양이 다르면 통째로 앞 4자만.
 */
export function maskRateKey(key: string): string {
    const parts = key.split(':')
    if (parts.length >= 3) {
        const id = parts.slice(2).join(':')
        return `${parts[0]}:${parts[1]}:${id.slice(0, 4)}…`
    }
    return key.slice(0, 4) + '…'
}

// ---------- 봇 팀 ----------
export interface TeamBotRow { user_id: string; role: string }
export interface TeamStats {
    teams: number                       // 봇을 하나라도 둔 사용자 수
    bots: number
    roles: Record<string, number>       // twin / chief / helper …
}
export function teamStats(rows: TeamBotRow[] | null): TeamStats | null {
    if (rows === null) return null
    const users = new Set<string>()
    const roles: Record<string, number> = {}
    for (const r of rows) {
        users.add(r.user_id)
        roles[r.role] = (roles[r.role] || 0) + 1
    }
    return { teams: users.size, bots: rows.length, roles }
}

// ---------- 승인 카드 ----------
export const APPROVAL_STATUSES = ['pending', 'allowed', 'denied', 'edited_allowed'] as const
export type ApprovalStatus = typeof APPROVAL_STATUSES[number]
export interface ApprovalRow { status: string; created_at: string }
export type StatusCounts = Record<ApprovalStatus, number>
export interface ApprovalStats {
    today: StatusCounts
    week: StatusCounts
    decidedWeek: Ratio                  // 7일 중 결정 난 카드 비율(허용+거절+고쳐서허용) / 전체
}
function emptyCounts(): StatusCounts {
    return { pending: 0, allowed: 0, denied: 0, edited_allowed: 0 }
}
function isApprovalStatus(s: string): s is ApprovalStatus {
    return (APPROVAL_STATUSES as readonly string[]).includes(s)
}
/** rows 는 이미 7일치만 받는다. sinceTodayIso 이후 것만 today 로 센다 */
export function approvalStats(rows: ApprovalRow[] | null, sinceTodayIso: string): ApprovalStats | null {
    if (rows === null) return null
    const today = emptyCounts()
    const week = emptyCounts()
    for (const r of rows) {
        if (!isApprovalStatus(r.status)) continue
        week[r.status]++
        if (r.created_at >= sinceTodayIso) today[r.status]++
    }
    const total = week.pending + week.allowed + week.denied + week.edited_allowed
    const decided = week.allowed + week.denied + week.edited_allowed
    return { today, week, decidedWeek: ratio(decided, total) }
}

// ---------- 체크인 ----------
export interface CheckinRow { day: string; user_id: string }
export interface CheckinStats {
    rows: number                        // 7일치 체크인 줄 수
    days: number                        // 체크인이 하나라도 있던 날 수(최대 7)
    users: number                       // 체크인한 사람 수
}
export function checkinStats(rows: CheckinRow[] | null): CheckinStats | null {
    if (rows === null) return null
    return {
        rows: rows.length,
        days: new Set(rows.map(r => r.day)).size,
        users: new Set(rows.map(r => r.user_id)).size,
    }
}

// ---------- 미룬 일 ----------
export interface NextStepRow { due_on: string | null; done_at: string | null }
export interface NextStepStats {
    open: number                        // 안 끝난 것 전부
    overdue: number                     // 안 끝났고 기한(due_on)이 오늘보다 앞
    overdueRatio: Ratio
}
export function nextStepStats(rows: NextStepRow[] | null, todayDate: string): NextStepStats | null {
    if (rows === null) return null
    const open = rows.filter(r => !r.done_at)
    const overdue = open.filter(r => !!r.due_on && r.due_on < todayDate)
    return { open: open.length, overdue: overdue.length, overdueRatio: ratio(overdue.length, open.length) }
}

// ---------- 메시지 로그 ----------
export interface MessageLogRow { channel: string; status: string }
export interface ChannelCounts { sent: number; blocked: number; failed: number }
export type MessageStats = Record<string, ChannelCounts>
export function messageStats(rows: MessageLogRow[] | null): MessageStats | null {
    if (rows === null) return null
    const out: MessageStats = {}
    for (const r of rows) {
        const c = (out[r.channel] ||= { sent: 0, blocked: 0, failed: 0 })
        if (r.status === 'sent') c.sent++
        else if (r.status === 'blocked') c.blocked++
        else if (r.status === 'failed') c.failed++
    }
    return out
}

// ---------- 요청 제한 ----------
export interface RateLimitRow { key: string; count: number }
export interface RateLimitTop { key: string; count: number }
/** 열쇠별 합산 → 많은 순 상위 n. 열쇠는 마스킹해서 돌려준다 */
export function rateLimitTop(rows: RateLimitRow[] | null, n = 5): RateLimitTop[] | null {
    if (rows === null) return null
    const sum = new Map<string, number>()
    for (const r of rows) sum.set(r.key, (sum.get(r.key) || 0) + (r.count || 0))
    return [...sum.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key, count]) => ({ key: maskRateKey(key), count }))
}

// ---------- 드라이버 상태 ----------
/** 환경변수 「있다/없다」만. 값은 절대 안 담는다 */
export function envPresence(env: Record<string, string | undefined>, names: readonly string[]): Record<string, boolean> {
    const out: Record<string, boolean> = {}
    for (const n of names) out[n] = !!(env[n] && env[n]!.trim())
    return out
}
