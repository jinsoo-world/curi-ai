// domains/chat — 대화 한 번의 마감 시각 (2026-10-06 「통째로 멈춤」 점검)
//
// 함수 시간 상한은 60초다. 곁가지 일(링크 읽기·노션·큐리어스·MCP·사진·자료 검색 등)이 늦어지면
// 정작 답을 쓸 시간이 없어 사용자는 빈 화면만 보다 끊겼다.
// 이제 대화를 시작할 때 마감(시작 + 55초)을 정하고, 곁가지 일은 「자기 상한」과 「남은 시간 - 25초(답 쓸 몫)」 중
// 짧은 쪽만 쓴다. 그 시간이 없으면 아예 건너뛴다. 답(솔라·Gemini)도 같은 마감을 넘기지 않는다.

/** 대화 한 번 전체 마감 (함수 상한 60초보다 5초 앞) */
export const CHAT_DEADLINE_MS = 55_000
/** 곁가지 일이 남겨 둬야 하는 답 쓸 몫 */
export const ANSWER_RESERVE_MS = 25_000
/** 이보다 짧게 남으면 곁가지 일을 아예 시작하지 않는다 */
export const MIN_SIDE_STEP_MS = 300

export interface ChatDeadline {
    /** 마감 시각 (epoch ms) */
    at: number
    /** 마감까지 남은 시간 (0 이상) */
    remaining(): number
    /** 곁가지 일에 쓸 수 있는 시간 = min(자기 상한, 남은 시간 - 답 몫). 너무 짧으면 0 (= 건너뛴다) */
    sideBudget(capMs: number): number
}

export function createChatDeadline(
    startMs: number = Date.now(),
    opts: { totalMs?: number; reserveMs?: number; now?: () => number } = {},
): ChatDeadline {
    const at = startMs + (opts.totalMs ?? CHAT_DEADLINE_MS)
    const reserve = opts.reserveMs ?? ANSWER_RESERVE_MS
    const now = opts.now ?? (() => Date.now())
    const remaining = () => Math.max(0, at - now())
    return {
        at,
        remaining,
        sideBudget(capMs: number) {
            const b = Math.min(capMs, remaining() - reserve)
            return b >= MIN_SIDE_STEP_MS ? Math.floor(b) : 0
        },
    }
}

/**
 * 일을 시간 안에서만 기다린다. 시간이 지나면 fallback 을 돌려주고 넘어간다(일 자체는 뒤에서 끝나든 말든).
 * work 가 함수면 시간이 0 일 때 아예 시작하지 않고, 시작할 때 끊기 신호를 넘긴다(fetch 에 그대로 넣으면 된다).
 * 던지는 일도 fallback 으로 받는다(곁가지 일 실패는 대화를 깨지 않는다).
 */
export async function withinBudget<T>(
    work: Promise<T> | ((signal: AbortSignal) => Promise<T>),
    budgetMs: number,
    fallback: T,
    label = 'side',
): Promise<T> {
    if (budgetMs <= 0) {
        if (typeof work !== 'function') work.catch(() => { /* 이미 시작한 일은 결과만 버린다 */ })
        console.warn(`[chat deadline] ${label} 건너뜀(남은 시간 부족)`)
        return fallback
    }
    const signal = AbortSignal.timeout(budgetMs)
    let p: Promise<T>
    try {
        p = typeof work === 'function' ? work(signal) : work
    } catch (e) {
        console.warn(`[chat deadline] ${label} 실패:`, e instanceof Error ? e.message : e)
        return fallback
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<'late'>(resolve => { timer = setTimeout(() => resolve('late'), budgetMs) })
    try {
        const won = await Promise.race([p.then(v => ({ v })), late])
        if (won === 'late') {
            p.catch(() => { /* 늦은 일의 오류는 버린다 */ })
            console.warn(`[chat deadline] ${label} ${budgetMs}ms 넘어 건너뜀`)
            return fallback
        }
        return won.v
    } catch (e) {
        console.warn(`[chat deadline] ${label} 실패:`, e instanceof Error ? e.message : e)
        return fallback
    } finally {
        clearTimeout(timer)
    }
}
