// domains/os — 사용 한도 (내 봇은 클로버 0. 대신 「5시간 한도 + 주간 한도」 두 창으로 예산을 지킨다)
//
// 대표 확정 0923: 「내 봇은 무료. 사용 한도는 한 줄로 = 퍼센트, 재설정 시기, 주간 한도 초기화」
// 순수 계산만 여기. DB 읽기는 usage-db.ts.

export const USAGE_LIMIT_5H = 20       // 무료 요금제 5시간 창 (대표 확정 0923: 무료 주 100번, 5시간 창은 주간의 1/5)
export const USAGE_LIMIT_WEEK = 100    // 무료 요금제 한 주(월요일 0시 서울 기준 초기화). 대표 확정 0923
export const WINDOW_5H_MS = 5 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 이번 주 시작 = 서울 기준 월요일 0시 (UTC Date 로 돌려준다) */
export function weekStartKST(now: Date): Date {
    const kst = new Date(now.getTime() + KST_OFFSET_MS)
    const day = kst.getUTCDay()                 // 0 일 … 6 토 (KST 기준 요일)
    const sinceMonday = (day + 6) % 7           // 월=0 … 일=6
    const mondayKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - sinceMonday)
    return new Date(mondayKst - KST_OFFSET_MS)
}

/** 다음 주간 초기화 시각 */
export function weekResetKST(now: Date): Date {
    return new Date(weekStartKST(now).getTime() + 7 * 24 * 60 * 60 * 1000)
}

export interface UsageInput {
    now: Date
    used5h: number
    /** 5시간 창 안에서 가장 오래된 대화 시각. 없으면 null (창이 비어 있음) */
    oldest5h: Date | null
    usedWeek: number
    limit5h?: number
    limitWeek?: number
}

export interface UsageView {
    used5h: number; limit5h: number; pct5h: number
    resetAt5h: Date | null           // 창이 비어 있으면 null
    usedWeek: number; limitWeek: number; pctWeek: number
    weekResetAt: Date
    blocked: boolean                 // 둘 중 하나라도 꽉 찼나
    line: string                     // 화면 한 줄
}

export function usageView(i: UsageInput): UsageView {
    const limit5h = i.limit5h ?? USAGE_LIMIT_5H
    const limitWeek = i.limitWeek ?? USAGE_LIMIT_WEEK
    const pct5h = Math.min(100, Math.round((i.used5h / limit5h) * 100))
    const pctWeek = Math.min(100, Math.round((i.usedWeek / limitWeek) * 100))
    const resetAt5h = i.oldest5h ? new Date(i.oldest5h.getTime() + WINDOW_5H_MS) : null
    const weekResetAt = weekResetKST(i.now)
    const blocked = i.used5h >= limit5h || i.usedWeek >= limitWeek
    return {
        used5h: i.used5h, limit5h, pct5h, resetAt5h,
        usedWeek: i.usedWeek, limitWeek, pctWeek, weekResetAt, blocked,
        line: usageLine({ pct5h, resetAt5h, pctWeek, weekResetAt, now: i.now }),
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

/** 한 줄: 「사용 한도 12% / 4시간 12분 후 재설정 / 주간 3% / (월) 0시 초기화」 */
export function usageLine(v: { pct5h: number; resetAt5h: Date | null; pctWeek: number; weekResetAt: Date; now: Date }): string {
    const reset = v.resetAt5h ? `${untilText(v.resetAt5h, v.now)} 재설정` : '아직 안 씀'
    return `사용 한도 ${v.pct5h}% / ${reset} / 주간 ${v.pctWeek}% / ${kstDayHourText(v.weekResetAt)} 초기화`
}

// ── 원형 게이지 + 사용량 모달 (대표 지시 0923: 「클로드코드처럼 원형으로, 누르면 모달로 사용량(클로버)」) ──

export type UsageTone = 'ok' | 'warn' | 'full'

/** 색 단계: 80% 미만 초록, 80% 이상 노랑, 100% 빨강 */
export function usageTone(pct: number): UsageTone {
    if (pct >= 100) return 'full'
    if (pct >= 80) return 'warn'
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
    used5h: number; limit5h: number; pct5h: number
    resetAt5h: Date | string | null
    usedWeek: number; limitWeek: number; pctWeek: number
    weekResetAt: Date | string
    blocked: boolean
}

export interface UsageDetail {
    fiveHourText: string     // 「12% 썼어요 (100번 중 12번)」
    fiveHourReset: string    // 「4시간 12분 후 다시 채워져요」 / 「아직 안 썼어요」
    weekText: string         // 「3% (1,000번 중 30번)」
    weekReset: string        // 「(월) 0시에 초기화」
    blockedText: string | null // 막혔을 때만. 「지금은 한도에 닿았어요. N 후 다시 쓸 수 있어요」
}

function toDate(d: Date | string | null): Date | null {
    if (d === null) return null
    return d instanceof Date ? d : new Date(d)
}

/** 모달 안 글자. 분모(한도)를 반드시 같이 쓴다 */
export function usageDetail(v: UsageLike, now: Date): UsageDetail {
    const resetAt5h = toDate(v.resetAt5h)
    const weekResetAt = toDate(v.weekResetAt) as Date
    let blockedText: string | null = null
    if (v.blocked) {
        const at = v.used5h >= v.limit5h && resetAt5h ? resetAt5h : weekResetAt
        blockedText = `지금은 한도에 닿았어요. ${untilText(at, now)} 다시 쓸 수 있어요`
    }
    return {
        fiveHourText: `${v.pct5h}% 썼어요 (${withComma(v.limit5h)}번 중 ${withComma(v.used5h)}번)`,
        fiveHourReset: resetAt5h ? `${untilText(resetAt5h, now)} 다시 채워져요` : '아직 안 썼어요',
        weekText: `${v.pctWeek}% (${withComma(v.limitWeek)}번 중 ${withComma(v.usedWeek)}번)`,
        weekReset: `${kstDayHourText(weekResetAt)}에 초기화`,
        blockedText,
    }
}
