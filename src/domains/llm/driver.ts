// domains/llm — 어느 드라이버로 답할지 고르는 규칙 한 곳
//
// 규칙(위에서부터 먼저 본다):
//  1. 사진이 붙은 대화 → Gemini (솔라 대화 모델은 사진을 못 본다)
//  2. LLM_DRIVER 로 못 박았으면 그대로 (되돌리기 스위치. Vercel 환경변수 한 줄로 바꾼다)
//  3. 아니면 솔라 열쇠가 있으면 솔라, 없으면 Gemini
//  4. 열쇠가 둘 다 없으면 none → 호출 쪽이 「쉬는 중」을 보여준다

import type { LlmDriverName } from './types'

export interface DriverEnv {
    LLM_DRIVER?: string
    UPSTAGE_API_KEY?: string
    GEMINI_API_KEY?: string
}

export function pickDriver(input: { hasImage: boolean; env: DriverEnv }): LlmDriverName {
    const { hasImage, env } = input
    const hasSolar = !!env.UPSTAGE_API_KEY
    const hasGemini = !!env.GEMINI_API_KEY

    if (hasImage && hasGemini) return 'gemini'

    const forced = (env.LLM_DRIVER || '').trim().toLowerCase()
    if (forced === 'gemini' && hasGemini) return 'gemini'
    if (forced === 'solar' && hasSolar) return 'solar'

    if (hasSolar) return 'solar'
    if (hasGemini) return 'gemini'
    return 'none'
}

/** 지금 프로세스의 환경변수로 고른다 */
export function pickDriverFromEnv(hasImage: boolean): LlmDriverName {
    return pickDriver({
        hasImage,
        env: {
            LLM_DRIVER: process.env.LLM_DRIVER,
            UPSTAGE_API_KEY: process.env.UPSTAGE_API_KEY,
            GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        },
    })
}
