// domains/chat — 손님(비로그인) 대화 문지기 (2026-10-06 「통째로 멈춤」 점검, 최상 등급 구멍)
//
// 예전엔 손님 횟수를 화면이 보낸 방문자 번호(visitorId) 하나로만 셌다. 번호는 화면이 만드는 값이라
// 지우고 새로 만들면 매번 0번부터였고, 번호 없이 부르면 'unknown' 으로 세고 'fp-해시' 로 저장해 영영 0번이었다.
// 이제:
//   1) 처음 보는 번호이거나 번호가 없으면 IP 로 센다(오늘 이 IP 에서 손님이 나눈 대화 수)
//   2) IP 하나당 하루 손님 대화 30번 (rate_limits 표, 원자적으로 센다)
//   3) 손님 전체 하루 상한 GUEST_DAILY_GLOBAL_CAP (기본 3,000번)
//   4) 세다가 실패하면 손님은 막는다(회원은 이 문지기를 안 지난다)
//   5) 세는 이름표와 저장 이름표를 하나로: 번호가 있으면 그 번호, 없으면 ip-<IP 해시>
// IP 는 원문 대신 해시로 열쇠를 만든다(guest_chat_logs.ip_address 에는 예전처럼 원문이 남는다).

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'

/** IP 하나당 하루 손님 대화 상한 */
export const GUEST_IP_DAILY_CAP = 30
/** 손님 전체 하루 상한 기본값 (GUEST_DAILY_GLOBAL_CAP 로 바꾼다) */
export const GUEST_GLOBAL_DAILY_CAP_DEFAULT = 3000
/** IP 하나당 분당 손님 요청 상한 */
export const GUEST_IP_PER_MINUTE = 20

export type GuestBlockReason = 'visitor_limit' | 'ip_limit' | 'global_limit' | 'count_failed'

/** 요청한 쪽 IP. Vercel 이 직접 적는 x-vercel-forwarded-for 를 먼저 믿는다(사용자가 위조할 수 없다),
 *  없으면 x-forwarded-for 첫 값, 그다음 x-real-ip. 없으면 빈 글 */
export function clientIp(req: Request): string {
    const first = (h: string) => req.headers.get(h)?.split(',')[0]?.trim() || ''
    return (first('x-vercel-forwarded-for') || first('x-forwarded-for') || first('x-real-ip')).slice(0, 45)
}

/** IP 원문 대신 쓰는 짧은 해시 (16자리) */
export function hashIp(ip: string): string {
    return createHash('sha256').update(`curi-guest:${ip}`).digest('hex').slice(0, 16)
}

/** 화면이 보낸 방문자 번호가 정상 모양이면 그대로, 아니면 null */
export function cleanVisitorId(v: unknown): string | null {
    return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null
}

/** guest_chat_logs.visitor_id 에 세고 저장하는 이름표 (둘이 같아야 센 만큼 쌓인다) */
export function guestLogLabel(visitorId: string | null, ipHash: string): string {
    return visitorId ?? `ip-${ipHash}`
}

export function guestDailyGlobalCap(env: Record<string, string | undefined> = process.env): number {
    const v = Number(env.GUEST_DAILY_GLOBAL_CAP)
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : GUEST_GLOBAL_DAILY_CAP_DEFAULT
}

/** 오늘(UTC) 0시 ~ 내일 0시. rate_limits 하루 창(UTC)과 같은 기준 */
export function utcDayRange(now: Date = new Date()): { from: string; to: string } {
    const d = now.toISOString().slice(0, 10)
    const next = new Date(`${d}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    return { from: `${d}T00:00:00Z`, to: next.toISOString() }
}

async function countToday(db: SupabaseClient, column: 'visitor_id' | 'ip_address', value: string, now: Date): Promise<number | null> {
    const { from, to } = utcDayRange(now)
    try {
        const { count, error } = await db
            .from('guest_chat_logs')
            .select('id', { count: 'exact', head: true })
            .eq(column, value)
            .gte('created_at', from)
            .lt('created_at', to)
        if (error || typeof count !== 'number') return null
        return count
    } catch {
        return null
    }
}

export interface GuestAllowance {
    allowed: boolean
    reason?: GuestBlockReason
    /** guest_chat_logs.visitor_id 에 저장할 이름표 */
    label: string
    ipHash: string
}

/**
 * 손님이 이번 말을 해도 되나. 세다가 실패하면 막는다.
 * 순서: 방문자/IP 하루 횟수(maxPerVisitor) → IP 하루 30번 → 손님 전체 하루 상한.
 * 뒤 두 개는 셀 때 하나씩 올라간다(시도 기준). 앞에서 막히면 뒤 숫자는 안 올린다.
 */
export async function checkGuestAllowance(
    db: SupabaseClient,
    input: { visitorId: unknown; ip: string; maxPerVisitor: number; now?: Date; env?: Record<string, string | undefined> },
): Promise<GuestAllowance> {
    const now = input.now ?? new Date()
    const visitorId = cleanVisitorId(input.visitorId)
    const ipHash = hashIp(input.ip)
    const label = guestLogLabel(visitorId, ipHash)
    const block = (reason: GuestBlockReason): GuestAllowance => ({ allowed: false, reason, label, ipHash })

    // 1) 이 방문자(또는 IP)가 오늘 나눈 대화 수
    let used: number | null = null
    if (visitorId) {
        used = await countToday(db, 'visitor_id', visitorId, now)
        if (used === null) return block('count_failed')
    }
    if (!visitorId || used === 0) {
        // 번호가 없거나 오늘 처음 보는 번호 = 번호를 새로 만들어 우회했을 수 있다 → 이 IP 의 오늘 손님 대화로 센다
        used = await countToday(db, 'ip_address', input.ip, now)
        if (used === null) return block('count_failed')
    }
    if ((used ?? 0) >= input.maxPerVisitor) return block('visitor_limit')

    // 2) IP 하나당 하루 상한
    const ipDay = await checkRateLimit(db, `guestday:ip:${ipHash}`, GUEST_IP_DAILY_CAP, 86400, { failClosed: true })
    if (!ipDay.allowed) return block('ip_limit')

    // 3) 손님 전체 하루 상한
    const all = await checkRateLimit(db, 'guestday:all', guestDailyGlobalCap(input.env), 86400, { failClosed: true })
    if (!all.allowed) return block('global_limit')

    return { allowed: true, label, ipHash }
}
