// domains/chat — 추천 질문 생성

import { GoogleGenAI } from '@google/genai'
import { GEMINI_MODEL } from './constants'

function getAI() {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

/**
 * 대화 맥락 기반 추천 질문 3개 생성
 */
export async function generateSuggestions(
    messages: { role: string; content: string }[],
    mentorName: string,
): Promise<string[]> {
    const recentMessages = messages.slice(-6).map(m =>
        `${m.role === 'user' ? '사용자' : '멘토'}: ${m.content}`
    ).join('\n')

    const result = await getAI().models.generateContent({
        model: GEMINI_MODEL,
        config: {
            temperature: 0.9,
            maxOutputTokens: 256,
        },
        contents: [{
            role: 'user',
            parts: [{
                text: `다음 대화를 읽고, 사용자가 ${mentorName}에게 할 수 있는 후속 질문 3개를 JSON 배열로만 응답하세요.
질문은 자연스럽고 대화를 더 깊이 이어갈 수 있는 것이어야 합니다.
한국어로 작성하고, 각 질문은 30자 이내로 짧게 작성하세요.

대화:
${recentMessages}

응답 형식 (JSON 배열만):
["질문1", "질문2", "질문3"]`
            }]
        }],
    })

    const text = result.text || '[]'
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
}
