// domains/llm = 솔라가 못 답해서 Gemini 로 넘어간 까닭을 짧은 이름 하나로 정한다.
// llm_usage.fallback_reason 에 남긴다. 열쇠를 넣은 뒤 무엇이 막는지 한눈에 보려고 쓴다.

export type FallbackReason =
    | 'missing_key'  // UPSTAGE_API_KEY 가 없다
    | 'auth'         // 401, 403 (열쇠가 틀렸거나 막힘, 크레딧 부족 포함)
    | 'timeout'      // 시간 초과
    | 'rate_limit'   // 429
    | 'server'       // 5xx
    | 'empty'        // 답이 비어 옴
    | 'image'        // 사진이 붙어서 처음부터 Gemini
    | 'forced'       // LLM_DRIVER 나 SIDE_TEXT_PROVIDER 로 Gemini 를 골랐다
    | 'other'

export function classifyFallbackReason(err: unknown): FallbackReason {
    if (err === null || err === undefined) return 'empty'
    const e = err as { name?: string; status?: number; message?: string }
    const msg = String(e?.message ?? err)
    const status = typeof e?.status === 'number' ? e.status : 0
    if (/UPSTAGE_API_KEY/.test(msg) && status === 0) return 'missing_key'
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || /timeout|timed out|aborted/i.test(msg)) return 'timeout'
    const s = status || Number(msg.match(/응답 (\d{3})/)?.[1] ?? 0)
    if (s === 401 || s === 403) return 'auth'
    if (s === 429) return 'rate_limit'
    if (s >= 500) return 'server'
    return 'other'
}
