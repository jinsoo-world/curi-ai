// domains/llm — Gemini 형식 대화 기록 → OpenAI 호환 형식
//
// 지금 대화 API 는 buildGeminiHistory 로 Gemini 모양(user/model + parts)을 만든다.
// 그 뒤를 전부 고치지 않고, 솔라로 보낼 때만 여기서 바꿔 끼운다(수술적 변경).

import type { GeminiMessage } from '@/domains/chat/types'
import type { LlmChatMessage } from './types'

/** 사진만 보낸 메시지의 자리표시. 빈 글자를 보내면 모델이 거절한다 */
const PHOTO_PLACEHOLDER = '(사진)'

export function geminiToOpenAi(
    systemPrompt: string,
    history: GeminiMessage[],
): { messages: LlmChatMessage[]; hasImage: boolean } {
    let hasImage = false
    const messages: LlmChatMessage[] = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })

    for (const msg of history) {
        const texts: string[] = []
        for (const part of msg.parts) {
            if ('inlineData' in part) hasImage = true
            else if (part.text) texts.push(part.text)
        }
        messages.push({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: texts.length ? texts.join('\n') : PHOTO_PLACEHOLDER,
        })
    }
    return { messages, hasImage }
}
