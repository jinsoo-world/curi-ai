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

/** 대화 온도. Gemini 설정(0.8)과 같게 */
export const SOLAR_TEMPERATURE = 0.8

/** 한 요청이 이보다 오래 걸리면 끊는다. Vercel 함수 상한(60초) 안에서 */
export const SOLAR_TIMEOUT_MS = 50_000
