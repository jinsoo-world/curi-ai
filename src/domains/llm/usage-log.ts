// domains/llm = 모델을 한 번 부를 때마다 비용과 걸린 시간을 llm_usage 표에 한 줄 남긴다.
//
// 대표 결정 0928: 요청마다 원가와 속도를 본다.
//   - 기록은 답을 절대 늦추거나 깨뜨리지 않는다: 기다리지 않고(fire-and-forget) 실패는 삼킨다.
//   - 끄기: LLM_USAGE_LOG_ENABLED=false
//   - 원화는 prices.ts 의 추정 가격표로 계산한다 (실제 청구는 콘솔이 기준).

import { createAdminClient } from '@/lib/supabase/admin'
import { estimateCostKrw } from './prices'

/** 누가, 어디서 불렀나. 호출 쪽이 옵션으로 넘긴다 (없으면 route 만 알 수 없음으로 남는다) */
export interface UsageCtx {
    route: string
    userId?: string | null
    mentorId?: string | null
    channelId?: string | null
}

export interface UsageEvent extends UsageCtx {
    /** chat, router, memory, embedding, relay, youtube, rewrite, cache */
    kind: string
    model: string
    provider?: 'solar' | 'gemini' | 'cache' | null
    inputTokens?: number | null
    outputTokens?: number | null
    /** 토큰 수가 모델이 준 값이 아니라 글자 수로 어림한 값인가 */
    tokensEstimated?: boolean
    ttftMs?: number | null
    latencyMs?: number | null
    fallback?: boolean
    cacheHit?: boolean
    ok?: boolean
    error?: string | null
    meta?: Record<string, unknown> | null
    /** 가격표로 못 맞추는 경우(유튜브 소리 토큰처럼)만 직접 계산한 원화 */
    costKrw?: number | null
}

export function usageLogEnabled(env: Record<string, string | undefined> = process.env): boolean {
    return String(env.LLM_USAGE_LOG_ENABLED ?? 'true').toLowerCase() !== 'false'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuidOrNull = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null)
const intOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null)

/** 표에 넣을 한 줄 (시험하기 쉽게 따로 뺐다) */
export function usageRow(e: UsageEvent) {
    const inputTokens = intOrNull(e.inputTokens)
    const outputTokens = intOrNull(e.outputTokens)
    return {
        route: String(e.route || 'unknown').slice(0, 120),
        kind: String(e.kind || 'other').slice(0, 40),
        provider: e.provider ?? null,
        model: String(e.model || 'unknown').slice(0, 80),
        user_id: uuidOrNull(e.userId),
        mentor_id: uuidOrNull(e.mentorId),
        channel_id: uuidOrNull(e.channelId),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        tokens_estimated: !!e.tokensEstimated,
        ttft_ms: intOrNull(e.ttftMs),
        latency_ms: intOrNull(e.latencyMs),
        cost_krw: e.cacheHit ? 0 : (typeof e.costKrw === 'number' && Number.isFinite(e.costKrw) ? e.costKrw : estimateCostKrw(e.model, inputTokens, outputTokens)),
        fallback: !!e.fallback,
        cache_hit: !!e.cacheHit,
        ok: e.ok !== false,
        error: e.error ? String(e.error).slice(0, 300) : null,
        meta: e.meta ?? null,
    }
}

type Inserter = (row: ReturnType<typeof usageRow>) => PromiseLike<unknown>
let inserterForTest: Inserter | null = null
/** 시험용: 표 대신 받아 볼 함수 */
export function setUsageInserterForTest(fn: Inserter | null) { inserterForTest = fn }

/** 기록 한 줄. 기다리지 않는다. 절대 던지지 않는다 */
export function logLlmUsage(e: UsageEvent): void {
    try {
        if (!usageLogEnabled()) return
        // 시험 중에는 진짜 표에 쓰지 않는다
        if (!inserterForTest && process.env.NODE_ENV === 'test') return
        const row = usageRow(e)
        const insert: Inserter = inserterForTest ?? (r => createAdminClient().from('llm_usage').insert(r))
        const p = Promise.resolve()
            .then(() => insert(row))
            .then(
                (res) => {
                    const err = (res as { error?: { message?: string } } | undefined)?.error
                    if (err) console.warn('[llm_usage] 기록 실패:', err.message)
                },
                (err) => console.warn('[llm_usage] 기록 실패:', err instanceof Error ? err.message : err),
            )
        keepAliveAfterResponse(p)
    } catch { /* 기록 때문에 답이 깨지면 안 된다 */ }
}

/** 응답을 보낸 뒤에도 기록을 끝내게 한다 (Next after). 요청 밖이면 그냥 둔다 */
function keepAliveAfterResponse(p: Promise<unknown>) {
    import('next/server')
        .then(({ after }) => { try { after(() => p) } catch { /* 요청 밖 */ } })
        .catch(() => {})
}

/** Gemini usageMetadata → 입력, 출력(생각 포함) 토큰 */
export function geminiTokens(meta: unknown): { input: number | null; output: number | null } {
    const m = (meta ?? {}) as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
    const input = typeof m.promptTokenCount === 'number' ? m.promptTokenCount : null
    const out = (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0)
    return { input, output: m.candidatesTokenCount === undefined && m.thoughtsTokenCount === undefined ? null : out }
}
