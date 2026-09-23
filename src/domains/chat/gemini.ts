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

/** 답변 설정(길이·최신성)이 기본값을 덮어쓸 때 쓰는 자리 */
export interface GeminiCallOptions {
    /** Length 설정에서 계산한 답 길이 상한(토큰). 안 주면 GEMINI_CONFIG 기본값(4096) */
    maxOutputTokens?: number
    /** false 면 구글 검색 도구를 안 붙인다(Strict 로 과거 자료만 답해야 하는 봇용). 안 주면 켠 채로(기존 동작) */
    recencyOn?: boolean
}

/**
 * Gemini 스트리밍 응답 생성
 * @param systemPrompt 시스템 프롬프트 (멘토 페르소나 + 유저 컨텍스트)
 * @param messages 대화 히스토리 (Gemini 형식)
 * @param opts 답변 설정(domains/os/response-settings) 이 계산해 넘기는 길이·최신성 조정
 * @returns AsyncIterable 스트리밍 응답
 */
export async function generateChatStream(
    systemPrompt: string,
    messages: GeminiMessage[],
    opts: GeminiCallOptions = {},
) {
    return getAI().models.generateContentStream({
        model: GEMINI_MODEL,
        config: {
            systemInstruction: systemPrompt,
            ...GEMINI_CONFIG,
            ...(typeof opts.maxOutputTokens === 'number' ? { maxOutputTokens: opts.maxOutputTokens } : {}),
            // 구글 검색 연결 — 멘토가 최신 정보를 찾아볼 수 있게 한다.
            // 이걸 안 켜면 학습 시점 이후의 일을 모르고, 모르는 채로 지어낸다.
            // (실측 2026-09-04: 오늘 날짜를 3월 25일이라고 답했다)
            // Recency 를 끈 봇(옛 자료만 다루는 Strict 봇 등)은 이 도구를 안 붙인다.
            ...(opts.recencyOn === false ? {} : { tools: [{ googleSearch: {} }] }),
        },
        contents: messages,
    })
}
