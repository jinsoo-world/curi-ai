// domains/llm — 모델 드라이버 공통 타입
//
// 「드라이버」= 어느 회사 모델이든 같은 모양으로 글을 흘려주는 껍데기.
// 화면·대화 API 는 드라이버가 솔라인지 Gemini 인지 몰라야 한다.
// (그록봇의 Driver SPI 개념. 모르는 드라이버는 unavailable 로 처리하고 전체를 죽이지 않는다)

/** 우리가 고를 수 있는 모델 회사 */
export type LlmDriverName = 'solar' | 'gemini' | 'none'

/** OpenAI 호환 대화 한 줄 (솔라가 이 형식을 받는다) */
export interface LlmChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

/** 스트림으로 흘러오는 조각. 대화 API 는 text 만 본다 */
export interface LlmChunk {
    text?: string
    done?: boolean
    usage?: LlmUsage | null
}

/** 토큰 사용량 (비용 계측용). LLM 이 돌려준 값만. 없으면 만들지 않는다 */
export interface LlmUsage {
    prompt: number
    completion: number
    /** 총합. API total_tokens 가 있으면 그걸, 없으면 prompt+completion */
    total: number
}
