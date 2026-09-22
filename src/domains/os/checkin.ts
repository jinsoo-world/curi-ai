// domains/os — 오늘 체크인 (칩으로 고르는 하루 한 줄). 순수 규칙만 둔다.
//
// 왜 있나 = 트윈(디지털 나)이 「요즘 어떻게 지내는지」를 알아야 다음 한 걸음을 제안할 수 있다.
// 글로 쓰라고 하면 아무도 안 쓴다. 그래서 전부 칩으로 고르게 하고, 막힌 일 한 줄만 선택으로 받는다.

import { seoulClock } from './schedule'

/** 오늘 한 일 칩 (여러 개 고를 수 있다) */
export const DID_CHIPS = ['강의', '글', '영상', '상담', '쉼', '기타'] as const
export type DidChip = typeof DID_CHIPS[number]

/** 1~5 를 사람 말로 (화면 칩에 그대로 쓴다) */
export const MOOD_LABELS = ['많이 지침', '조금 지침', '보통', '괜찮음', '좋음'] as const
export const ENERGY_LABELS = ['바닥', '조금 남음', '보통', '넉넉함', '팔팔함'] as const

export interface CheckinValue {
    mood: number | null
    energy: number | null
    did: string[]
    blocked: string | null
}

/** 한국 달력으로 오늘 (YYYY-MM-DD) */
export function todaySeoul(now: Date = new Date(), timeZone = 'Asia/Seoul'): string {
    const c = seoulClock(now, timeZone)
    return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`
}

/** 우리가 아는 칩만 남긴다. 중복 제거, 최대 6개 */
export function cleanDid(did: unknown): string[] {
    if (!Array.isArray(did)) return []
    const ok = new Set<string>(DID_CHIPS)
    const out: string[] = []
    for (const v of did) {
        if (typeof v !== 'string' || !ok.has(v) || out.includes(v)) continue
        out.push(v)
        if (out.length >= DID_CHIPS.length) break
    }
    return out
}

/** 1~5 안이면 그대로, 아니면 null */
export function cleanScore(v: unknown): number | null {
    const n = Number(v)
    if (!Number.isInteger(n) || n < 1 || n > 5) return null
    return n
}

/**
 * user_memories 에 남길 한 줄 (memory_type='context').
 * 고르지 않은 칸은 아예 적지 않는다 — 빈칸을 지어내면 봇이 그걸 사실로 읽는다.
 */
export function buildCheckinSummary(c: CheckinValue, day: string): string {
    const 조각: string[] = []
    if (c.mood !== null && c.mood !== undefined) 조각.push(`기분 ${c.mood}/5`)
    if (c.energy !== null && c.energy !== undefined) 조각.push(`에너지 ${c.energy}/5`)
    const did = cleanDid(c.did)
    if (did.length) 조각.push(`한 일 ${did.join('·')}`)
    const blocked = (c.blocked ?? '').trim()
    if (blocked) 조각.push(`막힌 일 ${blocked.slice(0, 120)}`)

    const 뒤 = 조각.length ? 조각.join(', ') : '고른 것 없이 들렀다'
    return `${day} 체크인 — ${뒤}`
}
