// domains/llm — 업스테이지 솔라 드라이버
//
// 솔라는 OpenAI 호환 API 다. SDK 를 새로 깔지 않고 fetch 로 직접 부른다(의존성 0 추가).
// 흘러오는 조각을 읽어 { text } 로 내놓고, 마지막에 { done, usage } 를 내놓는다.

import { SOLAR_BASE_URL, SOLAR_CHAT_MODEL, SOLAR_MAX_OUTPUT_TOKENS, SOLAR_TEMPERATURE, SOLAR_TIMEOUT_MS } from './constants'
import { readSseStream, extractDeltaText, extractUsage } from './sse'
import type { LlmChatMessage, LlmChunk, LlmUsage } from './types'

export class SolarError extends Error {
    status: number
    constructor(message: string, status = 0) {
        super(message)
        this.name = 'SolarError'
        this.status = status
    }
}

export interface SolarOptions {
    model?: string
    temperature?: number
    maxTokens?: number
    apiKey?: string
    signal?: AbortSignal
    /** 시험용. 안 주면 전역 fetch */
    fetchImpl?: typeof fetch
}

/**
 * 솔라에게 대화를 보내고 답을 조각으로 흘려받는다.
 * 실패는 SolarError 로 던진다. 되돌아가기(Gemini)는 호출 쪽(chat/stream.ts)이 한다.
 */
export async function* solarChatStream(
    systemPrompt: string,
    messages: LlmChatMessage[],
    opts: SolarOptions = {},
): AsyncGenerator<LlmChunk> {
    const apiKey = opts.apiKey ?? process.env.UPSTAGE_API_KEY
    if (!apiKey) throw new SolarError('UPSTAGE_API_KEY 가 없다', 0)

    const fetchImpl = opts.fetchImpl ?? fetch
    const body = {
        model: opts.model ?? SOLAR_CHAT_MODEL,
        messages: systemPrompt && messages[0]?.role !== 'system'
            ? [{ role: 'system', content: systemPrompt }, ...messages]
            : messages,
        stream: true,
        // 마지막 조각에 토큰 사용량을 실어 달라는 표시(OpenAI 호환). 모르면 무시된다.
        stream_options: { include_usage: true },
        temperature: opts.temperature ?? SOLAR_TEMPERATURE,
        max_tokens: opts.maxTokens ?? SOLAR_MAX_OUTPUT_TOKENS,
    }

    const signal = opts.signal ?? AbortSignal.timeout(SOLAR_TIMEOUT_MS)
    const res = await fetchImpl(`${SOLAR_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
    })

    if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '')
        throw new SolarError(`솔라 응답 ${res.status}: ${detail.slice(0, 300)}`, res.status)
    }

    let usage: LlmUsage | null = null
    for await (const payload of readSseStream(res.body)) {
        const text = extractDeltaText(payload)
        if (text) yield { text }
        const u = extractUsage(payload)
        if (u) usage = u
    }
    yield { done: true, usage }
}
