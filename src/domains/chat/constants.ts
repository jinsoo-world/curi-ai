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

/**
 * 무료 개방 여부 (2026-09-04 대표 지시)
 * 예전엔 채팅 라우트에 2026-04-30 종료일이 하드코딩돼 있었다.
 * 유료 전환은 이 값을 false 로 바꾼다. 날짜를 박지 않는다.
 */
export const FREE_TRIAL_OPEN = true

/** 무료 사용자 일일 대화 제한 (로그인) — 넉넉하게 (대표 지시 0904) */
export const MAX_DAILY_FREE = 100

/**
 * 비로그인 사용자 일일 대화 제한
 * 넉넉하게 열되 상한은 남긴다 — 대화 1턴마다 구글 AI 비용이 나가고
 * 자동충전 월 한도가 3만원(약 5,000턴)이라 무제한은 위험하다.
 */
export const MAX_DAILY_FREE_GUEST = 10

/** 유저 메모리 조회 제한 */
export const MAX_MEMORY_ITEMS = 10

/**
 * 음성 통화 무료 체험 한도 (대표 지시 0904 — 넉넉하게)
 * 예전엔 총 180초(3분)·한 통화 60초가 서로 다른 파일에 박혀 있었다.
 * 한 통화 60초는 말이 끝나기 전에 끊겼다.
 * ⚠️ 음성은 외부 업체 요금이 분당 나간다. 무제한으로 열지 않는다.
 */
export const VOICE_FREE_TOTAL_SECONDS = 900   // 총 15분
export const VOICE_MAX_CALL_SECONDS = 300     // 한 통화 5분
