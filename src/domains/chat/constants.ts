// domains/chat — 채팅 도메인 상수

import type { ThinkingLevel } from '@google/genai'

/** Gemini 모델명 (최신 안정판 Flash) */
export const GEMINI_MODEL = 'gemini-3.8-flash'

/** Gemini 기본 설정 */
export const GEMINI_CONFIG = {
    temperature: 0.8,
    maxOutputTokens: 4096,
    thinkingConfig: {
        // 3세대 모델은 thinkingBudget 대신 thinkingLevel 을 쓴다.
        // 3.8-flash 가 지원하는 최저값이 LOW (응답 속도 우선)
        thinkingLevel: 'LOW' as ThinkingLevel,
    },
} as const

/** 무료 사용자 일일 대화 제한 (로그인) */
export const MAX_DAILY_FREE = 20

/** 비로그인 사용자 일일 대화 제한 */
export const MAX_DAILY_FREE_GUEST = 3

/** 유저 메모리 조회 제한 */
export const MAX_MEMORY_ITEMS = 10
