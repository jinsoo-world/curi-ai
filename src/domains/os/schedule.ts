// domains/os — 루틴이 「지금 돌 때인가」를 정하는 규칙 한 곳 (순수 계산. DB 도 네트워크도 안 본다)
//
// 왜 따로 뒀나 = 시간 계산은 눈으로 못 본다. 여기만 시험으로 못 박아 두면
// 크론이 새벽에 두 번 돌거나 토요일에 도는 사고를 막을 수 있다.
//
// 규칙
//  · 창은 예정 시각부터 5분. 앞당겨 돌지 않는다(크론이 5분마다 오니 늦어도 5분 안에는 잡힌다).
//  · 같은 날 같은 시간대에 이미 돌았으면 건너뛴다(크론이 여러 번 와도 한 번만).
//  · 요일을 안 고른 「주 1회」는 돌지 않는다 — 넓은 트리거 금지(기획 §11).

export type ScheduleKind = 'daily' | 'weekdays' | 'weekly'
export type OnMissingData = 'report_failure' | 'skip'

/** 그 나라 달력으로 읽은 지금 */
export interface LocalClock {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    /** 0=일요일 … 6=토요일 */
    weekday: number
}

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** 기본 창 = 5분 (크론 주기와 같다) */
export const WINDOW_MINUTES = 5

/** UTC 시각을 그 나라(기본 한국) 달력으로 읽는다 */
export function seoulClock(at: Date, timeZone = 'Asia/Seoul'): LocalClock {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
        weekday: 'short',
    }).formatToParts(at)
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
    return {
        year: Number(get('year')),
        month: Number(get('month')),
        day: Number(get('day')),
        // 자정을 '24' 로 주는 환경이 있어 0 으로 되돌린다
        hour: Number(get('hour')) % 24,
        minute: Number(get('minute')),
        weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    }
}

/** '08:30:00' → 510(자정부터 몇 분). 못 읽으면 null */
export function parseLocalTime(text: string): number | null {
    const m = /^(\d{1,2}):(\d{2})/.exec((text ?? '').trim())
    if (!m) return null
    const h = Number(m[1]), mi = Number(m[2])
    if (h > 23 || mi > 59) return null
    return h * 60 + mi
}

/** '20:05:00' → '오후 8:05' (4060 손님이 읽는 모양) */
export function formatLocalTime(text: string): string {
    const mins = parseLocalTime(text)
    if (mins === null) return '시각 없음'
    const h = Math.floor(mins / 60), mi = mins % 60
    const 오전오후 = h < 12 ? '오전' : '오후'
    const 열두시간 = h <= 12 ? h : h - 12
    return `${오전오후} ${열두시간}:${String(mi).padStart(2, '0')}`
}

/** 예정 분(runAt)부터 windowMinutes 동안만 열린다 */
export function isInWindow(runAtMinutes: number, nowMinutes: number, windowMinutes = WINDOW_MINUTES): boolean {
    const diff = nowMinutes - runAtMinutes
    return diff >= 0 && diff < windowMinutes
}

export interface RoutineSchedule {
    schedule_kind: ScheduleKind
    run_at_local: string
    weekday: number | null
    timezone?: string | null
}

/** 지금이 이 루틴의 시간인가 (마지막 실행 기록은 안 본다 — 그건 alreadyRanInSlot) */
export function shouldRunNow(r: RoutineSchedule, now: Date, windowMinutes = WINDOW_MINUTES): boolean {
    const runAt = parseLocalTime(r.run_at_local)
    if (runAt === null) return false
    const clock = seoulClock(now, r.timezone || 'Asia/Seoul')
    if (r.schedule_kind === 'weekdays' && (clock.weekday === 0 || clock.weekday === 6)) return false
    if (r.schedule_kind === 'weekly') {
        if (r.weekday === null || r.weekday === undefined) return false   // 요일 안 고름 = 안 돈다
        if (clock.weekday !== r.weekday) return false
    }
    return isInWindow(runAt, clock.hour * 60 + clock.minute, windowMinutes)
}

/**
 * 같은 날 같은 시간대에 이미 돌았나.
 * 「같은 시간대」 = 예정 시각부터 60분 안. 크론이 5분마다 와도 한 번만 돌게 하는 빗장.
 */
export function alreadyRanInSlot(
    lastRunAt: string | null | undefined,
    now: Date,
    runAtLocal: string,
    timeZone = 'Asia/Seoul',
): boolean {
    if (!lastRunAt) return false
    const runAt = parseLocalTime(runAtLocal)
    if (runAt === null) return false
    const last = seoulClock(new Date(lastRunAt), timeZone)
    const nowC = seoulClock(now, timeZone)
    if (last.year !== nowC.year || last.month !== nowC.month || last.day !== nowC.day) return false
    const lastMin = last.hour * 60 + last.minute
    return lastMin >= runAt && lastMin < runAt + 60
}

/** 목록에 적는 한 줄: 「평일 오전 8:30」 */
export function describeSchedule(r: Pick<RoutineSchedule, 'schedule_kind' | 'run_at_local' | 'weekday'>): string {
    const 시각 = formatLocalTime(r.run_at_local)
    if (r.schedule_kind === 'daily') return `매일 ${시각}`
    if (r.schedule_kind === 'weekdays') return `평일 ${시각}`
    if (r.weekday === null || r.weekday === undefined) return '요일을 아직 안 골랐어요'
    return `매주 ${WEEKDAY_NAMES[r.weekday] ?? '?'}요일 ${시각}`
}

export interface RoutinePromptInput {
    title: string
    instruction: string
    input_source?: string | null
    expected_output?: string | null
    on_missing_data: OnMissingData
    approval_boundary?: string | null
}

/**
 * 루틴이 돌 때 봇에게 건네는 말 한 덩어리.
 * 봇의 성격·말투는 mentors.system_prompt 가 맡고, 여기는 「이번 일」만 적는다.
 */
export function buildRoutinePrompt(r: RoutinePromptInput): string {
    const 없을때 = r.on_missing_data === 'skip'
        ? '- 볼 자료가 없으면 아무 말도 지어내지 말고 「이번에는 볼 것이 없어서 건너뜁니다」 한 줄만 적는다.'
        : '- 볼 자료가 없으면 지어내지 말고 「자료가 없어서 못 했어요」라고 먼저 적고, 무엇이 있어야 되는지 한 줄로 알려 준다.'

    const 줄 = [
        `[루틴] ${r.title}`,
        '',
        '[이번에 할 일]',
        r.instruction.trim(),
        '',
        '[어디를 보고 만드나]',
        (r.input_source ?? '').trim() || '따로 준 자료는 없다. 지금까지의 대화와 기억만 본다.',
        '',
        '[무엇이 나와야 성공인가]',
        (r.expected_output ?? '').trim() || '사람이 30초 안에 확인할 수 있는 짧은 결과 하나.',
        '',
        '[지킬 것]',
        없을때,
        `- 밖으로 나가는 일(메시지 보내기·게시·구매·이체·삭제)은 **직접 하지 않는다**. 초안까지만 만들고 사람이 허용할 때까지 기다린다.`,
    ]
    const 경계 = (r.approval_boundary ?? '').trim()
    if (경계) 줄.push(`- 승인 경계: ${경계}`)
    줄.push('- 결론 먼저, 짧게. 어려운 말은 쉬운 말로 푼다.')
    return 줄.join('\n')
}
