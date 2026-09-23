// domains/os — 사용 한도 (내 봇은 클로버 0. 대신 「5시간 한도 + 주간 한도」 두 창으로 예산을 지킨다)
//
// 대표 확정 0923: 「내 봇은 무료. 사용 한도는 한 줄로 = 퍼센트, 재설정 시기, 주간 한도 초기화」
// 순수 계산만 여기. DB 읽기는 usage-db.ts.

export const USAGE_LIMIT_5H = 100      // 5시간 창 안에서 보낼 수 있는 내 봇 대화 수
export const USAGE_LIMIT_WEEK = 1000   // 한 주(월요일 0시 서울 기준 초기화)
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
