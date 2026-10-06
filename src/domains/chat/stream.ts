// domains/chat — 대화 답을 흘려주는 입구 (드라이버 선택 + 되돌아가기)
//
// 대화 API(/api/chat)는 이 함수 하나만 부른다. 여기서
//  1. 어느 모델로 답할지 고르고 (domains/llm/driver)
//  2. 솔라가 첫 글자도 못 내고 죽으면 Gemini 로 되돌아가고
//  3. 둘 다 죽으면 오류 대신 「쉬는 중」 한 줄을 내놓는다 (전체가 죽지 않는다)
//
// 화면 쪽 약속 = chunk.text 만 본다. usage 는 서버 저장용(선택)이라 화면은 무시해도 된다.

import { generateChatStream as generateGeminiStream } from './gemini'
import { geminiToOpenAi, pickDriverFromEnv, solarChatStream, SOLAR_CHAT_MODEL, SOLAR_TIMEOUT_MS, solarFirstTokenTimeoutMs } from '@/domains/llm'
import type { LlmChunk, LlmUsage } from '@/domains/llm'
import { logLlmUsage, geminiTokens } from '@/domains/llm/usage-log'
import type { UsageCtx } from '@/domains/llm/usage-log'
import { classifyFallbackReason, SolarSlowError } from '@/domains/llm/fallback-reason'
import { solarMaxOutputTokens } from '@/domains/os/response-settings'
import type { FallbackReason } from '@/domains/llm/fallback-reason'
import type { GeminiMessage } from './types'
import { GEMINI_MODEL, UNAVAILABLE_TEXT, TRUNCATED_NOTE } from './constants'
export { UNAVAILABLE_TEXT, TRUNCATED_NOTE }

/** 누가 답했나 (마지막에 한 번). searched = Gemini 가 구글 검색을 썼나 */
export interface AnsweredBy { provider: 'solar' | 'gemini'; searched: boolean }
type TextChunk = { text?: string; usage?: LlmUsage | null; answer?: AnsweredBy }

/** 답변 설정(domains/os/response-settings) 이 계산해 넘기는 길이·최신성 조정. 안 주면 기존 동작 그대로 */
export interface ChatStreamOptions {
    /** Length 설정에서 계산한 답 길이 상한(토큰) */
    maxOutputTokens?: number
    /** false 면 Gemini 의 구글 검색 도구를 끈다(솔라는 애초에 검색 도구가 없다) */
    recencyOn?: boolean
    /** 검색을 부탁한 말이면 true (search-intent). 솔라 대신 구글 검색이 되는 Gemini 가 답한다 */
    webSearch?: boolean
    /** true 면 길이 상한에 걸려 잘린 답 끝에 「이어서」 안내를 붙인다 (1:1 대화만. 그룹방, 전달, 평가 도구는 안 붙인다) */
    truncationNote?: boolean
    /** 비용 기록(llm_usage)에 남길 자리. 안 주면 route 를 모르는 채로 남긴다 */
    usage?: UsageCtx & { kind?: string }
    /** 대화 마감 시각(epoch ms). 솔라·Gemini 둘 다 이 시각이 지나면 끊는다. 안 주면 각자 상한(50초) */
    deadline?: number
}

/** Gemini 첫 글자 마감. 이 안에 글이 안 오면 끊는다 (끄기 없음, GEMINI_FIRST_TOKEN_MS 로 조정) */
export const GEMINI_FIRST_TOKEN_MS = 6_000
/** 검색(구글 검색 도구)·사진을 보는 Gemini 는 찾고 읽는 시간이 있어 첫 글자 마감을 조금 길게 */
export const GEMINI_SEARCH_FIRST_TOKEN_MS = 10_000
/** 마감을 안 줬을 때 Gemini 한 번의 전체 상한 */
const GEMINI_TOTAL_MS = SOLAR_TIMEOUT_MS

function geminiFirstTokenMs(search: boolean): number {
    const v = Number(process.env.GEMINI_FIRST_TOKEN_MS)
    if (Number.isFinite(v) && v > 0) return v
    return search ? GEMINI_SEARCH_FIRST_TOKEN_MS : GEMINI_FIRST_TOKEN_MS
}

/** 마감까지 남은 시간(ms). 마감이 없으면 fallback */
function msLeft(deadline: number | undefined, fallback: number): number {
    return typeof deadline === 'number' ? Math.max(0, Math.min(fallback, deadline - Date.now())) : fallback
}

/** 검색 Gemini 가 첫 글자도 못 내고 실패했다 (솔라로 넘어가는 신호) */
class GeminiFailedBeforeText extends Error {}

/** 한 번의 답에 걸린 시간과 토큰을 모아 두었다가 끝날 때 한 줄 남긴다 */
function usageMeter(opts: ChatStreamOptions) {
    const started = Date.now()
    let ttft: number | null = null
    return {
        firstToken() { if (ttft === null) ttft = Date.now() - started },
        log(e: { provider: 'solar' | 'gemini'; model: string; input?: number | null; output?: number | null; fallback?: boolean; ok?: boolean; error?: string; fallbackReason?: FallbackReason | null; searchQueries?: number | null; solarError?: string | null }) {
            logLlmUsage({
                route: opts.usage?.route ?? 'unknown',
                userId: opts.usage?.userId, mentorId: opts.usage?.mentorId, channelId: opts.usage?.channelId,
                kind: opts.usage?.kind ?? 'chat',
                provider: e.provider, model: e.model,
                inputTokens: e.input ?? null, outputTokens: e.output ?? null,
                ttftMs: ttft, latencyMs: Date.now() - started,
                fallback: e.fallback, ok: e.ok, error: e.error,
                fallbackReason: e.fallbackReason ?? null, searchQueries: e.searchQueries ?? null,
                meta: e.solarError ? { solarError: e.solarError.slice(0, 200) } : null,
            })
        },
    }
}

/**
 * 솔라 → (실패하거나 첫 글자가 늦으면) Gemini → (또 실패 시) 쉬는 중.
 * 되돌아가기는 「첫 조각이 오기 전」에만 한다. 답을 하다 끊긴 건 그대로 끝낸다
 * (반쪽 답 뒤에 다른 모델의 답을 이어 붙이면 사람이 더 헷갈린다).
 * 첫 글자가 solarFirstTokenTimeoutMs()(기본 4초) 안에 안 오면 솔라 요청을 끊고 Gemini 로 넘긴다 (fallback_reason 'slow').
 */
async function* solarWithFallback(
    systemPrompt: string,
    history: GeminiMessage[],
    opts: ChatStreamOptions = {},
    /** false = 솔라가 죽어도 Gemini 로 안 간다(검색 Gemini 가 이미 실패해 넘어온 경우) */
    geminiFallback = true,
): AsyncGenerator<TextChunk> {
    const { messages } = geminiToOpenAi(systemPrompt, history)
    const started = Date.now()
    const meter = usageMeter(opts)
    let firstChunkSeen = false
    let usage: LlmChunk['usage'] = null
    let truncated = false
    let solarLogged = false
    let reason: FallbackReason = 'other'
    let solarError: string | null = null

    // 솔라 요청을 우리가 끊을 수 있게 한다: 첫 글자가 늦을 때, 그리고 전체 시간 상한(50초, 대화 마감이 더 이르면 그때)
    const ctrl = new AbortController()
    const totalTimer = setTimeout(() => ctrl.abort(), msLeft(opts.deadline, SOLAR_TIMEOUT_MS))
    const firstTokenMs = solarFirstTokenTimeoutMs()
    let solarDone = false
    const iter = solarChatStream('', messages, { maxTokens: solarMaxOutputTokens(opts.maxOutputTokens), signal: ctrl.signal })[Symbol.asyncIterator]()
    /** 다음 조각을 받는다. 첫 글자 전이면 남은 시간과 겨뤄서, 늦으면 요청을 끊고 SolarSlowError 를 던진다 */
    const nextChunk = async (): Promise<IteratorResult<LlmChunk>> => {
        const pending = iter.next()
        if (firstChunkSeen || firstTokenMs <= 0) return pending
        const left = Math.max(0, firstTokenMs - (Date.now() - started))
        let timer: ReturnType<typeof setTimeout> | undefined
        const slow = new Promise<'slow'>(resolve => { timer = setTimeout(() => resolve('slow'), left) })
        try {
            const won = await Promise.race([pending, slow])
            if (won !== 'slow') return won
        } finally {
            clearTimeout(timer)
        }
        pending.catch(() => { /* 끊은 요청의 오류는 버린다 */ })
        ctrl.abort()
        throw new SolarSlowError(firstTokenMs)
    }

    try {
        while (true) {
            const step = await nextChunk()
            if (step.done) { solarDone = true; break }
            const chunk = step.value
            if (chunk.text) {
                firstChunkSeen = true
                meter.firstToken()
                yield { text: chunk.text }
            }
            if (chunk.done) {
                usage = chunk.usage
                truncated = chunk.finishReason === 'length'
            }
        }
        if (truncated && firstChunkSeen && opts.truncationNote) yield { text: TRUNCATED_NOTE }
        console.log(`[LLM] driver=solar model=${SOLAR_CHAT_MODEL} ms=${Date.now() - started} prompt=${usage?.prompt ?? '?'} completion=${usage?.completion ?? '?'}`)
        meter.log({ provider: 'solar', model: SOLAR_CHAT_MODEL, input: usage?.prompt, output: usage?.completion })
        solarLogged = true
        // 실제 토큰만 넘긴다. 없으면 usage 조각을 안 보낸다(가짜 숫자 금지).
        yield { answer: { provider: 'solar', searched: false } }
        if (usage) yield { usage }
        return
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (firstChunkSeen) {
            // 답하다 끊김. 나온 글은 살리고 조용히 끝낸다
            console.error(`[LLM] solar cut mid-stream after ${Date.now() - started}ms: ${msg}`)
            meter.log({ provider: 'solar', model: SOLAR_CHAT_MODEL, ok: false, error: msg })
            solarLogged = true
            return
        }
        reason = classifyFallbackReason(err)
        solarError = msg
        console.error(`[LLM] solar failed before first token (${reason}), falling back to gemini: ${msg}`)
    } finally {
        // 받는 쪽이 중간에 멈춰도(응답 필터가 끊음) 한 줄은 남긴다
        if (firstChunkSeen && !solarLogged) meter.log({ provider: 'solar', model: SOLAR_CHAT_MODEL, input: usage?.prompt, output: usage?.completion })
        clearTimeout(totalTimer)
        // 다 못 읽고 나왔으면(받는 쪽이 멈춤, 늦어서 끊음) 요청을 끊어 토큰이 더 나가지 않게 한다
        if (!solarDone) ctrl.abort()
        // 솔라 스트림을 닫는다(다 읽었으면 아무 일도 없다. 중간에 멈췄거나 늦어서 끊었으면 연결을 정리한다)
        Promise.resolve(iter.return?.(undefined)).catch(() => { /* 닫다가 난 오류는 무시 */ })
    }

    // 되돌아가기
    if (!process.env.GEMINI_API_KEY || !geminiFallback || msLeft(opts.deadline, 1) <= 0) {
        yield { text: UNAVAILABLE_TEXT }
        return
    }
    yield* geminiStream(systemPrompt, history, opts, meter, true, reason, solarError)
}

/** Gemini 로 흘려받기 (마지막 조각의 usageMetadata 로 토큰을 남긴다) */
async function* geminiStream(
    systemPrompt: string, history: GeminiMessage[], opts: ChatStreamOptions,
    meter: ReturnType<typeof usageMeter>, fallback: boolean,
    fallbackReason: FallbackReason | null = null, solarError: string | null = null,
    /** 'throw' = 첫 글자 전에 실패하면 「쉬는 중」 대신 GeminiFailedBeforeText 를 던진다(검색 → 솔라 넘김용) */
    failMode: 'unavailable' | 'throw' = 'unavailable',
): AsyncGenerator<TextChunk> {
    let meta: unknown = null
    let logged = false
    /** 구글 검색 도구가 실제로 돌린 검색어 수 (검색 도구 비용 확인용) */
    let searchQueries = 0
    let truncated = false
    let gotText = false
    const log = (ok: boolean, error?: string) => {
        if (logged) return
        logged = true
        const t = geminiTokens(meta)
        meter.log({ provider: 'gemini', model: GEMINI_MODEL, input: t.input, output: t.output, fallback, ok, error, fallbackReason, searchQueries, solarError })
    }
    // 끊기 신호: 첫 글자 마감(보통 6초, 검색 10초) + 전체 마감(대화 마감까지 남은 시간, 없으면 50초)
    const ctrl = new AbortController()
    const totalMs = msLeft(opts.deadline, GEMINI_TOTAL_MS)
    const totalTimer = setTimeout(() => ctrl.abort(new Error('gemini deadline')), totalMs)
    const firstMs = Math.min(geminiFirstTokenMs(fallbackReason === 'search' || fallbackReason === 'image'), totalMs)
    let firstTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => ctrl.abort(new Error(`gemini first token > ${firstMs}ms`)), firstMs)
    /** 끊기 신호가 오면 기다리던 다음 조각을 바로 실패로 (SDK 가 신호를 늦게 보더라도 멈추지 않게) */
    const aborted = new Promise<never>((_r, rej) => {
        if (ctrl.signal.aborted) rej(ctrl.signal.reason)
        ctrl.signal.addEventListener('abort', () => rej(ctrl.signal.reason), { once: true })
    })
    aborted.catch(() => { /* 아래 race 에서 받는다 */ })
    try {
        if (totalMs <= 0) throw new Error('gemini deadline passed')
        const gemini = await Promise.race([generateGeminiStream(systemPrompt, history, { ...opts, abortSignal: ctrl.signal }), aborted])
        const it = gemini[Symbol.asyncIterator]()
        while (true) {
            const step = await Promise.race([it.next(), aborted])
            if (step.done) break
            const chunk = step.value
            if (chunk.usageMetadata) meta = chunk.usageMetadata
            const q = chunk.candidates?.[0]?.groundingMetadata?.webSearchQueries
            if (Array.isArray(q) && q.length > searchQueries) searchQueries = q.length
            if (chunk.text) {
                meter.firstToken(); gotText = true
                if (firstTimer) { clearTimeout(firstTimer); firstTimer = undefined }
            }
            if (chunk.candidates?.[0]?.finishReason === 'MAX_TOKENS') truncated = true
            yield { text: chunk.text || '' }
        }
        if (truncated && gotText && opts.truncationNote) yield { text: TRUNCATED_NOTE }
        if (fallback) console.log('[LLM] driver=gemini(fallback)')
        log(true)
        yield { answer: { provider: 'gemini', searched: searchQueries > 0 } }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[LLM] gemini ${fallback ? 'fallback failed too' : 'failed'}: ${msg}`)
        log(false, msg)
        if (failMode === 'throw' && !gotText) throw new GeminiFailedBeforeText(msg)
        yield { text: UNAVAILABLE_TEXT }
    } finally {
        log(true)
        clearTimeout(totalTimer)
        if (firstTimer) clearTimeout(firstTimer)
        // 다 못 읽고 나왔으면 요청을 끊어 토큰이 더 나가지 않게 한다
        if (!ctrl.signal.aborted) ctrl.abort(new Error('done'))
    }
}

/**
 * 검색을 부탁한 말 = 구글 검색이 되는 Gemini 가 먼저. 첫 글자도 못 내고 죽으면(마감 포함) 검색 없이 솔라가 답한다.
 * 솔라까지 죽으면 Gemini 를 또 부르지 않고 「쉬는 중」 (같은 고장에 두 번 기다리지 않는다).
 */
async function* searchWithSolarFallback(systemPrompt: string, history: GeminiMessage[], opts: ChatStreamOptions): AsyncGenerator<TextChunk> {
    try {
        yield* geminiStream(systemPrompt, history, opts, usageMeter(opts), false, 'search', null, 'throw')
        return
    } catch (err) {
        if (!(err instanceof GeminiFailedBeforeText)) throw err
        console.error('[LLM] 검색 Gemini 실패, 검색 없이 솔라로:', err.message.slice(0, 160))
    }
    if (!process.env.UPSTAGE_API_KEY) {
        yield { text: UNAVAILABLE_TEXT }
        return
    }
    yield* solarWithFallback(systemPrompt, history, { ...opts, webSearch: false }, false)
}

async function* geminiOnly(systemPrompt: string, history: GeminiMessage[], opts: ChatStreamOptions = {}, reason: FallbackReason | null = null): AsyncGenerator<TextChunk> {
    yield* geminiStream(systemPrompt, history, opts, usageMeter(opts), false, reason)
}

async function* unavailable(): AsyncGenerator<TextChunk> {
    yield { text: UNAVAILABLE_TEXT }
}

/**
 * 대화 답 스트림. 반환 모양은 예전 Gemini 직접 호출과 같다(for await … chunk.text).
 * opts(길이·최신성)는 답변 설정(domains/os/response-settings)이 계산해 넘긴다. 안 주면 기존 동작 그대로.
 */
export async function generateChatStream(
    systemPrompt: string,
    history: GeminiMessage[],
    opts: ChatStreamOptions = {},
): Promise<AsyncIterable<TextChunk>> {
    const { hasImage } = geminiToOpenAi('', history)
    const driver = pickDriverFromEnv(hasImage)
    if (driver === 'solar') {
        if (opts.webSearch && opts.recencyOn !== false && process.env.GEMINI_API_KEY) return searchWithSolarFallback(systemPrompt, history, opts)
        return solarWithFallback(systemPrompt, history, opts)
    }
    if (driver === 'gemini') {
        // 왜 솔라가 아닌지 남긴다: 사진, 열쇠 없음, 아니면 LLM_DRIVER 로 골랐음
        const reason: FallbackReason = hasImage ? 'image' : (!process.env.UPSTAGE_API_KEY ? 'missing_key' : 'forced')
        return geminiOnly(systemPrompt, history, opts, reason)
    }
    console.error('[LLM] no driver available (no UPSTAGE_API_KEY, no GEMINI_API_KEY)')
    return unavailable()
}
