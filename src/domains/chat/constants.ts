// domains/chat — 채팅 도메인 상수

/** Gemini 모델명 */
export const GEMINI_MODEL = 'gemini-2.5-flash'

/** Gemini 기본 설정 */
export const GEMINI_CONFIG = {
    temperature: 0.8,
    maxOutputTokens: 4096,
    thinkingConfig: {
        thinkingBudget: 0,   // 사고 과정 출력 완전 비활성화
    },
} as const

/** 무료 사용자 일일 대화 제한 (로그인) */
export const MAX_DAILY_FREE = 20

/** 비로그인 사용자 일일 대화 제한 */
export const MAX_DAILY_FREE_GUEST = 5

/** 유저 메모리 조회 제한 */
export const MAX_MEMORY_ITEMS = 10
