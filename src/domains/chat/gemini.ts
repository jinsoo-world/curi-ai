// domains/chat — Gemini API 호출 로직

import { GoogleGenAI } from '@google/genai'
import { GEMINI_MODEL, GEMINI_CONFIG } from './constants'
import type { GeminiMessage } from './types'

let aiInstance: GoogleGenAI | null = null

function getAI(): GoogleGenAI {
    if (!aiInstance) {
        aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
    }
    return aiInstance
}

/**
 * Gemini 스트리밍 응답 생성
 * @param systemPrompt 시스템 프롬프트 (멘토 페르소나 + 유저 컨텍스트)
 * @param messages 대화 히스토리 (Gemini 형식)
 * @returns AsyncIterable 스트리밍 응답
 */
export async function generateChatStream(
    systemPrompt: string,
    messages: GeminiMessage[],
) {
    return getAI().models.generateContentStream({
        model: GEMINI_MODEL,
        config: {
            systemInstruction: systemPrompt,
            ...GEMINI_CONFIG,
            // 구글 검색 연결 — 멘토가 최신 정보를 찾아볼 수 있게 한다.
            // 이걸 안 켜면 학습 시점 이후의 일을 모르고, 모르는 채로 지어낸다.
            // (실측 2026-09-04: 오늘 날짜를 3월 25일이라고 답했다)
            tools: [{ googleSearch: {} }],
        },
        contents: messages,
    })
}
