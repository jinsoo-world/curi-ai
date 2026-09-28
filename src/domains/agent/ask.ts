// domains/agent — 모델에게 한 번 묻고 답 전체를 받아오는 작은 도구 (스트림 아님)
//
// askSolar  = 솔라만 (분류·사이드 비트). 열쇠 없거나 죽으면 null.
// askChat   = 1:1 대화와 같은 드라이버+폴백(솔라→Gemini). 그룹/중계 등 사람이 읽는 답에 쓴다.

import { solarChatStream } from '@/domains/llm'
import { SOLAR_MINI_MODEL } from '@/domains/llm/constants'
import { generateChatStream, UNAVAILABLE_TEXT } from '@/domains/chat/stream'
import type { GeminiMessage } from '@/domains/chat/types'
import { logLlmUsage, geminiTokens } from '@/domains/llm/usage-log'
import { GEMINI_MODEL, GEMINI_CONFIG } from '@/domains/chat/constants'
import type { UsageCtx } from '@/domains/llm/usage-log'

export interface AskOptions {
    model?: string
    temperature?: number
    maxTokens?: number
    /** 짧게 끊고 싶을 때 (사이드 비트 등). 안 주면 솔라 기본 타임아웃 */
    signal?: AbortSignal
    /** 비용 기록(llm_usage) 자리. kind 는 router, rewrite 처럼 무슨 일인지 */
    usage?: UsageCtx & { kind?: string }
}

/** 솔라에게 한 번 묻고 답 전체를 문자열로 받는다. 안 되면 null */
export async function askSolar(
    systemPrompt: string, userText: string, opts: AskOptions = {},
): Promise<string | null> {
    if (!process.env.UPSTAGE_API_KEY) return null
    const model = opts.model ?? SOLAR_MINI_MODEL
    const started = Date.now()
    let ttft: number | null = null
    let usage: { prompt: number; completion: number } | null = null
    const log = (ok: boolean, error?: string) => logLlmUsage({
        route: opts.usage?.route ?? 'unknown',
        userId: opts.usage?.userId, mentorId: opts.usage?.mentorId, channelId: opts.usage?.channelId,
        kind: opts.usage?.kind ?? 'ask', provider: 'solar', model,
        inputTokens: usage?.prompt ?? null, outputTokens: usage?.completion ?? null,
        ttftMs: ttft, latencyMs: Date.now() - started, ok, error,
    })
    try {
        let out = ''
        for await (const chunk of solarChatStream(
            systemPrompt,
            [{ role: 'user', content: userText }],
            {
                model,
                temperature: opts.temperature ?? 0,
                maxTokens: opts.maxTokens ?? 1024,
                signal: opts.signal,
            },
        )) {
            if (chunk.text) {
                if (ttft === null) ttft = Date.now() - started
                out += chunk.text
            }
            if (chunk.done && chunk.usage) usage = chunk.usage
        }
        log(true)
        return out.trim() || null
    } catch (e) {
        console.error('[agent/ask] 솔라 실패:', e instanceof Error ? e.message : e)
        log(false, e instanceof Error ? e.message : String(e))
        return null
    }
}

export interface AskChatOptions {
    maxTokens?: number
    recencyOn?: boolean
    usage?: UsageCtx & { kind?: string }
}

/**
 * 1:1 대화와 같은 경로로 한 번 묻고 답 전체를 받는다 (솔라→Gemini 폴백).
 * 둘 다 죽거나 「쉬는 중」만 나오면 null — 호출쪽이 UNAVAILABLE_TEXT 를 붙인다.
 */
export async function askChat(
    systemPrompt: string,
    userText: string,
    opts: AskChatOptions = {},
): Promise<string | null> {
    try {
        const history: GeminiMessage[] = [{ role: 'user', parts: [{ text: userText }] }]
        let out = ''
        for await (const chunk of await generateChatStream(systemPrompt, history, {
            maxOutputTokens: opts.maxTokens,
            recencyOn: opts.recencyOn,
            usage: opts.usage,
        })) {
            if (chunk.text) out += chunk.text
        }
        const trimmed = out.trim()
        if (!trimmed || trimmed === UNAVAILABLE_TEXT) return null
        return trimmed
    } catch (e) {
        console.error('[agent/ask] askChat 실패:', e instanceof Error ? e.message : e)
        return null
    }
}

/**
 * Gemini 에게 짧게 한 번 묻는다 (스트림 아님, 검색 도구 없음). 안 되면 null.
 * 솔라가 막혔을 때 짧은 보조 일(검색어 다시 쓰기)을 이어 가려고 쓴다.
 */
export async function askGeminiQuick(
    systemPrompt: string, userText: string, opts: { maxTokens?: number; signal?: AbortSignal; usage?: UsageCtx & { kind?: string } } = {},
): Promise<string | null> {
    if (!process.env.GEMINI_API_KEY) return null
    const started = Date.now()
    const log = (ok: boolean, meta: unknown, error?: string) => {
        const t = geminiTokens(meta)
        logLlmUsage({
            route: opts.usage?.route ?? 'unknown',
            userId: opts.usage?.userId, mentorId: opts.usage?.mentorId, channelId: opts.usage?.channelId,
            kind: opts.usage?.kind ?? 'ask', provider: 'gemini', model: GEMINI_MODEL, fallback: true,
            inputTokens: t.input, outputTokens: t.output, latencyMs: Date.now() - started, ok, error,
        })
    }
    try {
        const { GoogleGenAI } = await import('@google/genai')
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
        const res = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: userText }] }],
            config: {
                systemInstruction: systemPrompt,
                temperature: 0,
                maxOutputTokens: opts.maxTokens ?? 512,
                abortSignal: opts.signal,
                thinkingConfig: { thinkingLevel: GEMINI_CONFIG.thinkingConfig.thinkingLevel },
            },
        })
        log(true, res.usageMetadata)
        return (res.text ?? '').trim() || null
    } catch (e) {
        log(false, null, e instanceof Error ? e.message : String(e))
        return null
    }
}

/** 솔라 미니로 짧게 묻고, 솔라가 막히면 남은 시간 안에서 Gemini 로 한 번 (끄기: QUICK_ASK_GEMINI_FALLBACK=false) */
export async function askQuickWithFallback(
    systemPrompt: string, userText: string, opts: { timeoutMs: number; maxTokens?: number; usage?: UsageCtx & { kind?: string } },
): Promise<string | null> {
    const signal = AbortSignal.timeout(opts.timeoutMs)
    const solar = await askSolar(systemPrompt, userText, { model: SOLAR_MINI_MODEL, temperature: 0, maxTokens: opts.maxTokens ?? 60, signal, usage: opts.usage })
    if (solar) return solar
    if (signal.aborted || String(process.env.QUICK_ASK_GEMINI_FALLBACK ?? 'true').toLowerCase() === 'false') return null
    return askGeminiQuick(systemPrompt, userText, { signal, usage: opts.usage })
}
