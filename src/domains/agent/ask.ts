// domains/agent — 모델에게 한 번 묻고 답 전체를 받아오는 작은 도구 (스트림 아님)
//
// askSolar  = 솔라만 (분류·사이드 비트). 열쇠 없거나 죽으면 null.
// askChat   = 1:1 대화와 같은 드라이버+폴백(솔라→Gemini). 그룹/중계 등 사람이 읽는 답에 쓴다.

import { solarChatStream } from '@/domains/llm'
import { SOLAR_MINI_MODEL } from '@/domains/llm/constants'
import { generateChatStream, UNAVAILABLE_TEXT } from '@/domains/chat/stream'
import type { GeminiMessage } from '@/domains/chat/types'

export interface AskOptions {
    model?: string
    temperature?: number
    maxTokens?: number
    /** 짧게 끊고 싶을 때 (사이드 비트 등). 안 주면 솔라 기본 타임아웃 */
    signal?: AbortSignal
}

/** 솔라에게 한 번 묻고 답 전체를 문자열로 받는다. 안 되면 null */
export async function askSolar(
    systemPrompt: string, userText: string, opts: AskOptions = {},
): Promise<string | null> {
    if (!process.env.UPSTAGE_API_KEY) return null
    try {
        let out = ''
        for await (const chunk of solarChatStream(
            systemPrompt,
            [{ role: 'user', content: userText }],
            {
                model: opts.model ?? SOLAR_MINI_MODEL,
                temperature: opts.temperature ?? 0,
                maxTokens: opts.maxTokens ?? 1024,
                signal: opts.signal,
            },
        )) {
            if (chunk.text) out += chunk.text
        }
        return out.trim() || null
    } catch (e) {
        console.error('[agent/ask] 솔라 실패:', e instanceof Error ? e.message : e)
        return null
    }
}

export interface AskChatOptions {
    maxTokens?: number
    recencyOn?: boolean
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
