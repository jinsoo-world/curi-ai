// domains/os — 「이번 주」 카드 숫자 (순수 계산). DB 읽기는 api 가 하고 여기는 세기만 한다.
//
// 그록봇 「주간 로스터 리뷰」의 아주 작은 첫 판(기획 §11).
// 네 칸만 본다: 미룬 일 몇 개(가장 오래된 게 며칠째) · 승인 카드 처리 수 · 체크인 며칠 · 읽은 자료 수.
// 숫자에는 늘 분모가 될 기간(이번 주)이 붙는다.

import { seoulClock } from './schedule'

export interface WeeklySummary {
    /** 아직 안 끝낸 다음 한 걸음 개수 */
    openNextSteps: number
    /** 그중 가장 오래 묵은 것이 며칠째인가 */
    oldestDays: number
    /** 이번 주에 허용·거절·고쳐서 허용으로 답한 승인 카드 수 */
    approvalsDecided: number
    /** 이번 주에 체크인한 날 수 (같은 날 여러 줄은 하루) */
    checkinDays: number
    /** 이번 주에 봇이 새로 읽은 자료 수 */
    knowledgeRead: number
}

export const EMPTY_WEEK: WeeklySummary = {
    openNextSteps: 0, oldestDays: 0, approvalsDecided: 0, checkinDays: 0, knowledgeRead: 0,
}

/** 승인 카드가 「처리됐다」고 보는 상태 */
const DECIDED = new Set(['allowed', 'denied', 'edited_allowed'])

/** 한국 달력으로 이번 주 월요일 (YYYY-MM-DD) */
export function weekStartSeoul(now: Date, timeZone = 'Asia/Seoul'): string {
    const c = seoulClock(now, timeZone)
    // 일요일(0)은 그 주의 끝이라 6일 전이 월요일
    const 뒤로 = c.weekday === 0 ? 6 : c.weekday - 1
    const d = new Date(Date.UTC(c.year, c.month - 1, c.day))
    d.setUTCDate(d.getUTCDate() - 뒤로)
    return d.toISOString().slice(0, 10)
}

/** YYYY-MM-DD 두 개 사이의 날 수 (뒤 - 앞). 음수면 0 */
function daysBetween(fromIso: string, toIso: string): number {
    const a = Date.parse(`${fromIso}T00:00:00Z`)
    const b = Date.parse(`${toIso}T00:00:00Z`)
    if (Number.isNaN(a) || Number.isNaN(b)) return 0
    return Math.max(0, Math.round((b - a) / 86_400_000))
}

export interface WeeklyInput {
    nextSteps: { due_on: string | null; done_at: string | null; created_at: string }[]
    approvals: { status: string }[]
    /** 이번 주 체크인 행들의 day (YYYY-MM-DD). 중복이 있어도 된다 */
    checkinDays: string[]
    knowledgeCount: number
}

/** todayIso = 한국 오늘 (YYYY-MM-DD) */
export function summarizeWeek(input: WeeklyInput, todayIso: string): WeeklySummary {
    const open = input.nextSteps.filter(s => !s.done_at)
    let oldest = 0
    for (const s of open) {
        const 기준 = s.due_on ?? (s.created_at || '').slice(0, 10)
        if (!기준) continue
        const 며칠 = daysBetween(기준, todayIso)
        if (며칠 > oldest) oldest = 며칠
    }
    return {
        openNextSteps: open.length,
        oldestDays: oldest,
        approvalsDecided: input.approvals.filter(a => DECIDED.has(a.status)).length,
        checkinDays: new Set(input.checkinDays.filter(Boolean)).size,
        knowledgeRead: input.knowledgeCount,
    }
}
