// domains/agent — 모델에게 한 번 묻고 답 전체를 받아오는 작은 도구 (스트림 아님)
//
// 대화는 글이 흘러야 하지만, 분류, 초안은 「다 나온 답 한 덩어리」면 된다.
// 실패하면 null 을 돌려준다. 절대 던지지 않는다 — 분류가 안 되면 그냥 평소대로 대화하면 되기 때문이다.

import { solarChatStream } from '@/domains/llm'
import { SOLAR_MINI_MODEL } from '@/domains/llm/constants'

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
