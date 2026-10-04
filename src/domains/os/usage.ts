// domains/os: 사용 한도 (내 봇은 클로버 0. 대신 월간 한도 하나로 예산을 지킨다)
//
// 대표 결정 0928 23:42: 한도는 월간 사용량 하나로 통일. 주 단위 한도와 5시간 창은 없앤다.
// 숫자와 문구는 usage-config.ts. 순수 계산만 여기. DB 읽기는 usage-db.ts.
import { MONTHLY_LIMITS, MONTHLY_COUNT_SINCE, USAGE_WARN_PCT, USAGE_COPY, fillCopy } from './usage-config'
import type { PlanId } from './plan'

/** 무료 요금제 한 달 답변 수 */
export const USAGE_LIMIT_MONTH = MONTHLY_LIMITS.free
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 이번 주 시작 = 서울 기준 월요일 0시 (UTC Date). 봇 주인이 정하는 방문자 주간 캡, 주간 보고에서 쓴다 */
export function weekStartKST(now: Date): Date {
    const kst = new Date(now.getTime() + KST_OFFSET_MS)
    const day = kst.getUTCDay()                 // 0 일 … 6 토 (KST 기준 요일)
    const sinceMonday = (day + 6) % 7           // 월=0 … 일=6
    const mondayKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - sinceMonday)
    return new Date(mondayKst - KST_OFFSET_MS)
}

/** 다음 주 월요일 0시 (서울) */
export function weekResetKST(now: Date): Date {
    return new Date(weekStartKST(now).getTime() + 7 * 24 * 60 * 60 * 1000)
}

/** 이번 달 시작 = 서울 기준 1일 0시 (UTC Date) */
export function monthStartKST(now: Date): Date {
    const kst = new Date(now.getTime() + KST_OFFSET_MS)
    return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - KST_OFFSET_MS)
}

/** 다음 달 1일 0시 (서울) = 월간 한도가 다시 채워지는 때 */
export function monthResetKST(now: Date): Date {
    const kst = new Date(now.getTime() + KST_OFFSET_MS)
    return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + 1, 1) - KST_OFFSET_MS)
}

/** 이번 달 사용량을 세기 시작하는 때. 월간 한도로 바꾼 시점 전은 넣지 않는다 */
export function usageCountFrom(now: Date, since: string = MONTHLY_COUNT_SINCE): Date {
    const start = monthStartKST(now)
    const s = new Date(since)
    return Number.isNaN(s.getTime()) || s.getTime() <= start.getTime() ? start : s
}

export interface UsageInput {
    now: Date
    used: number
    limit?: number
    plan?: PlanId
}

export interface UsageView {
    plan: PlanId
    used: number
    limit: number
    pct: number
    remaining: number
    resetAt: Date
    blocked: boolean                 // 이번 달 한도를 다 썼나
    warn: boolean                    // 알림 퍼센트(80) 이상, 아직 안 막힘
    line: string                     // 화면 한 줄
}

export function usageView(i: UsageInput): UsageView {
    const limit = Math.max(1, i.limit ?? USAGE_LIMIT_MONTH)
    const used = Math.max(0, i.used)
    const pct = Math.min(100, Math.round((used / limit) * 100))
    const remaining = Math.max(0, limit - used)
    const resetAt = monthResetKST(i.now)
    const blocked = used >= limit
    return {
        plan: i.plan ?? 'free',
        used, limit, pct, remaining, resetAt, blocked,
        warn: !blocked && pct >= USAGE_WARN_PCT,
        line: usageLine({ pct, resetAt }),
    }
}

/** 「1시간 35분 후」 꼴. 1분 미만은 「곧」 */
export function untilText(target: Date, now: Date): string {
    const ms = target.getTime() - now.getTime()
    if (ms < 60_000) return '곧'
    const totalMin = Math.round(ms / 60_000)
    const h = Math.floor(totalMin / 60), m = totalMin % 60
    if (h === 0) return `${m}분 후`
    if (m === 0) return `${h}시간 후`
    return `${h}시간 ${m}분 후`
}

const KO_DAY = ['일', '월', '화', '수', '목', '금', '토']

/** 서울 기준 「(월) 0시」 꼴 */
export function kstDayHourText(d: Date): string {
    const kst = new Date(d.getTime() + KST_OFFSET_MS)
    return `(${KO_DAY[kst.getUTCDay()]}) ${kst.getUTCHours()}시`
}

/** 서울 기준 「10월 1일 0시」 꼴 */
export function kstDateHourText(d: Date): string {
    const kst = new Date(d.getTime() + KST_OFFSET_MS)
    return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${kst.getUTCHours()}시`
}

/** 한 줄: 「이번 달 사용 한도 12% / 10월 1일 0시 초기화」 */
export function usageLine(v: { pct: number; resetAt: Date }): string {
    return `이번 달 사용 한도 ${v.pct}% / ${kstDateHourText(v.resetAt)} 초기화`
}

/** 한도에 닿았을 때 대화 자리에 보내는 말 */
export function limitReachedMessage(resetAt: Date, opts: { iosApp?: boolean } = {}): string {
    // 아이폰 앱 안에서는 요금제를 올리라는 말을 하지 않는다(앱스토어 3.1.1)
    if (opts.iosApp) return `이번 달 사용 한도에 닿았어요. ${kstDateHourText(resetAt)}에 다시 채워져요.`
    return `이번 달 사용 한도에 닿았어요. ${kstDateHourText(resetAt)}에 다시 채워져요. 더 쓰려면 요금제를 올려 보세요.`
}

// ── 원형 게이지 + 사용량 모달 ──

export type UsageTone = 'ok' | 'warn' | 'full'

/** 색 단계: 알림 퍼센트 미만 초록, 이상 노랑, 100% 빨강 */
export function usageTone(pct: number): UsageTone {
    if (pct >= 100) return 'full'
    if (pct >= USAGE_WARN_PCT) return 'warn'
    return 'ok'
}

/** 원형 게이지 단추가 읽어 주는 글자 */
export function ringLabel(pct: number): string {
    return `사용 한도 ${pct}%, 누르면 자세히`
}

/** 1000 → 「1,000」 */
export function withComma(n: number): string {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** JSON 으로 건너오면 Date 가 문자열이 된다. 둘 다 받는다 */
export interface UsageLike {
    plan?: string
    used: number; limit: number; pct: number; remaining: number
    resetAt: Date | string
    blocked: boolean
    warn?: boolean
}

/** 대화가 끝난 뒤 새 사용량을 화면끼리 알리는 이벤트 이름 (OsChat 이 보내고 UsageBar 가 받는다) */
export const USAGE_EVENT = 'curi:usage'

/** 서버 응답이 새 모양(월간)인가. 옛 모양이면 화면에 안 그린다 */
export function isUsageLike(u: unknown): u is UsageLike {
    const v = u as Partial<UsageLike> | null
    return !!v && typeof v.pct === 'number' && typeof v.limit === 'number' && typeof v.used === 'number' && v.resetAt != null
}

export interface UsageDetail {
    remainingText: string    // 「이번 달 사용량 40%」 (횟수는 안 보임)
    pctText: string          // 「40%」
    resetText: string        // 「10월 1일 0시에 초기화」
    blockedText: string | null
}

function toDate(d: Date | string): Date {
    return d instanceof Date ? d : new Date(d)
}

/** 사용량 한 줄 (모달 첫 줄, 설정). 횟수 대신 퍼센트 */
export function remainingText(v: Pick<UsageLike, 'pct'>): string {
    return fillCopy(USAGE_COPY.remaining, v.pct)
}

/** 모달 안 글자 */
export function usageDetail(v: UsageLike, now: Date): UsageDetail {
    void now
    const resetAt = toDate(v.resetAt)
    return {
        remainingText: remainingText(v),
        pctText: `${v.pct}%`,
        resetText: `${kstDateHourText(resetAt)}에 초기화`,
        blockedText: v.blocked ? `이번 달 한도에 닿았어요. ${kstDateHourText(resetAt)}에 다시 쓸 수 있어요` : null,
    }
}
