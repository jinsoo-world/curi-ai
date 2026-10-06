// Supabase 호출 시간 제한 (2026-10-06 「통째로 멈춤」 점검).
// 예전엔 Supabase 가 대답을 안 하면 서버가 하염없이 기다리다 함수 시간(60초)을 다 써 버렸다.
// 이제 Supabase 로 나가는 모든 요청에 마감을 건다: 보통 5초, 로그인 확인 3초, 긴 일(저장소 업로드 등)은 따로 60초.
// 마감이 지나면 요청이 끊기고, supabase-js 는 던지지 않고 { error } 로 돌려준다(호출 쪽 기존 처리 그대로).

/** 보통 DB 조회·쓰기 마감 */
export const DB_TIMEOUT_MS = 5_000
/** 로그인 확인(/auth/v1/) 마감 */
export const AUTH_TIMEOUT_MS = 3_000
/** 저장소 업로드·대량 쓰기처럼 오래 걸리는 일 (createAdminClient({ longRunning: true })) */
export const DB_LONG_TIMEOUT_MS = 60_000

function urlOf(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.href
    return (input as Request).url ?? ''
}

/** 이 주소에 쓸 마감. 로그인 확인은 더 짧게 */
export function timeoutForUrl(input: RequestInfo | URL, defaultMs: number): number {
    return urlOf(input).includes('/auth/v1/') ? Math.min(AUTH_TIMEOUT_MS, defaultMs) : defaultMs
}

function anySignal(signals: AbortSignal[]): AbortSignal {
    const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
    if (any) return any(signals)
    const ctrl = new AbortController()
    for (const s of signals) {
        if (s.aborted) { ctrl.abort(s.reason); break }
        s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true })
    }
    return ctrl.signal
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** 마감을 거는 fetch. 시험에서 확인할 수 있게 마감 값을 함수에 붙여 둔다 */
export function timeoutFetch(defaultMs: number, opts: { base?: FetchFn } = {}): FetchFn & { timeoutMs: number } {
    const base: FetchFn = opts.base ?? ((input, init) => fetch(input, init))
    const f = ((input: RequestInfo | URL, init?: RequestInit) => {
        const timeout = AbortSignal.timeout(timeoutForUrl(input, defaultMs))
        const callerSignal = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined)
        const signal = callerSignal ? anySignal([callerSignal, timeout]) : timeout
        return base(input, { ...init, signal })
    }) as FetchFn & { timeoutMs: number }
    f.timeoutMs = defaultMs
    return f
}
