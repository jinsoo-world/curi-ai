// domains/chat — 대화 답을 흘려주는 입구 (드라이버 선택 + 되돌아가기)
//
// 대화 API(/api/chat)는 이 함수 하나만 부른다. 여기서
//  1. 어느 모델로 답할지 고르고 (domains/llm/driver)
//  2. 솔라가 첫 글자도 못 내고 죽으면 Gemini 로 되돌아가고
//  3. 둘 다 죽으면 오류 대신 「쉬는 중」 한 줄을 내놓는다 (전체가 죽지 않는다)
//
// 화면 쪽 약속 = chunk.text 만 본다. usage 는 서버 저장용(선택)이라 화면은 무시해도 된다.

import { generateChatStream as generateGeminiStream } from './gemini'
import { geminiToOpenAi, pickDriverFromEnv, solarChatStream, SOLAR_CHAT_MODEL } from '@/domains/llm'
import type { LlmChunk, LlmUsage } from '@/domains/llm'
import { logLlmUsage, geminiTokens } from '@/domains/llm/usage-log'
import type { UsageCtx } from '@/domains/llm/usage-log'
import { classifyFallbackReason } from '@/domains/llm/fallback-reason'
import type { FallbackReason } from '@/domains/llm/fallback-reason'
import type { GeminiMessage } from './types'
import { GEMINI_MODEL, UNAVAILABLE_TEXT } from './constants'
export { UNAVAILABLE_TEXT }

/** 누가 답했나 (마지막에 한 번). searched = Gemini 가 구글 검색을 썼나 */
export interface AnsweredBy { provider: 'solar' | 'gemini'; searched: boolean }
type TextChunk = { text?: string; usage?: LlmUsage | null; answer?: AnsweredBy }

/** 답변 설정(domains/os/response-settings) 이 계산해 넘기는 길이·최신성 조정. 안 주면 기존 동작 그대로 */
export interface ChatStreamOptions {
    /** Length 설정에서 계산한 답 길이 상한(토큰) */
    maxOutputTokens?: number
    /** false 면 Gemini 의 구글 검색 도구를 끈다(솔라는 애초에 검색 도구가 없다) */
    recencyOn?: boolean
    /** 비용 기록(llm_usage)에 남길 자리. 안 주면 route 를 모르는 채로 남긴다 */
    usage?: UsageCtx & { kind?: string }
}

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
 * 솔라 → (실패 시) Gemini → (또 실패 시) 쉬는 중.
 * 되돌아가기는 「첫 조각이 오기 전」에만 한다. 답을 하다 끊긴 건 그대로 끝낸다
 * (반쪽 답 뒤에 다른 모델의 답을 이어 붙이면 사람이 더 헷갈린다).
 */
async function* solarWithFallback(
    systemPrompt: string,
    history: GeminiMessage[],
    opts: ChatStreamOptions = {},
): AsyncGenerator<TextChunk> {
    const { messages } = geminiToOpenAi(systemPrompt, history)
    const started = Date.now()
    const meter = usageMeter(opts)
    let firstChunkSeen = false
    let usage: LlmChunk['usage'] = null
    let solarLogged = false
    let reason: FallbackReason = 'other'
    let solarError: string | null = null

    try {
        for await (const chunk of solarChatStream('', messages, { maxTokens: opts.maxOutputTokens })) {
            if (chunk.text) {
                firstChunkSeen = true
                meter.firstToken()
                yield { text: chunk.text }
            }
            if (chunk.done) usage = chunk.usage
        }
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
    }

    // 되돌아가기
    if (!process.env.GEMINI_API_KEY) {
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
): AsyncGenerator<TextChunk> {
    let meta: unknown = null
    let logged = false
    /** 구글 검색 도구가 실제로 돌린 검색어 수 (검색 도구 비용 확인용) */
    let searchQueries = 0
    const log = (ok: boolean, error?: string) => {
        if (logged) return
        logged = true
        const t = geminiTokens(meta)
        meter.log({ provider: 'gemini', model: GEMINI_MODEL, input: t.input, output: t.output, fallback, ok, error, fallbackReason, searchQueries, solarError })
    }
    try {
        const gemini = await generateGeminiStream(systemPrompt, history, opts)
        for await (const chunk of gemini) {
            if (chunk.usageMetadata) meta = chunk.usageMetadata
            const q = chunk.candidates?.[0]?.groundingMetadata?.webSearchQueries
            if (Array.isArray(q) && q.length > searchQueries) searchQueries = q.length
            if (chunk.text) meter.firstToken()
            yield { text: chunk.text || '' }
        }
        if (fallback) console.log('[LLM] driver=gemini(fallback)')
        log(true)
        yield { answer: { provider: 'gemini', searched: searchQueries > 0 } }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[LLM] gemini ${fallback ? 'fallback failed too' : 'failed'}: ${msg}`)
        log(false, msg)
        yield { text: UNAVAILABLE_TEXT }
    } finally {
        log(true)
    }
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
    if (driver === 'solar') return solarWithFallback(systemPrompt, history, opts)
    if (driver === 'gemini') {
        // 왜 솔라가 아닌지 남긴다: 사진, 열쇠 없음, 아니면 LLM_DRIVER 로 골랐음
        const reason: FallbackReason = hasImage ? 'image' : (!process.env.UPSTAGE_API_KEY ? 'missing_key' : 'forced')
        return geminiOnly(systemPrompt, history, opts, reason)
    }
    console.error('[LLM] no driver available (no UPSTAGE_API_KEY, no GEMINI_API_KEY)')
    return unavailable()
}
