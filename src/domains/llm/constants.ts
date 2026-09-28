// domains/llm — 모델 이름·주소 상수 (실측 2026-09-23 업스테이지 콘솔 문서)
//
// 별명(alias)을 쓴다. 업스테이지가 새 판을 내면 별명이 따라가므로 코드를 안 고친다.
//  solar-pro4  → solar-pro4-260806  : 대표 모델. 대화·에이전트. 입력 $0.30 / 출력 $1.20 (100만 토큰)
//  solar-mini4 → solar-mini4-260922 : 값싼 모델. 분류·요약·기억 추출. 입력 $0.10 / 출력 $0.40
// 둘 다 한국어·영어·일본어, 512K 문맥, 도구 호출·구조화 출력 지원. 분당 100회 / 25만 토큰 한도.

export const SOLAR_BASE_URL = 'https://api.upstage.ai/v1'

/** 대화용 (환경변수로 바꿀 수 있다) */
export const SOLAR_CHAT_MODEL = process.env.LLM_MODEL_CHAT || 'solar-pro4'

/** 분류·요약·기억 추출용 (싼 쪽) */
export const SOLAR_MINI_MODEL = process.env.LLM_MODEL_MINI || 'solar-mini4'

/** 대화 답 길이 상한. Gemini 설정(4096)과 같게 */
export const SOLAR_MAX_OUTPUT_TOKENS = 4096

/**
 * 대화 온도. 처음엔 Gemini(0.8)와 같게 뒀다가 0.6 으로 낮췄다.
 * 실측 0929: 0.8 에서 「즉,_money_ 없이」처럼 영어와 기호가 섞이고, 지침에 없는 가격을 지어냈다.
 */
export const SOLAR_TEMPERATURE = 0.6

/** 한 요청이 이보다 오래 걸리면 끊는다. Vercel 함수 상한(60초) 안에서 */
export const SOLAR_TIMEOUT_MS = 50_000

/** 첫 글자 기다리는 기본값. 이 안에 첫 글자가 안 오면 Gemini 로 넘긴다 (실측 0929: 12번 중 3번이 4.9~6.9초) */
export const SOLAR_FIRST_TOKEN_TIMEOUT_DEFAULT_MS = 4_000

/**
 * 대화 답에서 솔라 첫 글자를 기다리는 시간(밀리초). 환경변수 SOLAR_FIRST_TOKEN_TIMEOUT_MS 로 바꾼다.
 * 0 이면 끈다(예전처럼 실패할 때만 넘어간다). 이상한 값이면 기본값.
 * 부를 때마다 읽는다(시험에서 바꿔 끼울 수 있게).
 */
export function solarFirstTokenTimeoutMs(): number {
    const raw = process.env.SOLAR_FIRST_TOKEN_TIMEOUT_MS
    if (raw === undefined || raw.trim() === '') return SOLAR_FIRST_TOKEN_TIMEOUT_DEFAULT_MS
    const v = Number(raw)
    if (!Number.isFinite(v) || v < 0) return SOLAR_FIRST_TOKEN_TIMEOUT_DEFAULT_MS
    return Math.min(v, SOLAR_TIMEOUT_MS)
}
