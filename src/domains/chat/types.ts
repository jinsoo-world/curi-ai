// domains/chat — 채팅 도메인 타입 정의

export type { ChatSession, Message } from '@/types'

/** 채팅 API 요청 페이로드 */
export interface ChatRequest {
    messages: { role: 'user' | 'assistant'; content: string }[]
    mentorId: string
    sessionId?: string
}

/** Gemini에 전달할 메시지 형식 */
export interface GeminiMessage {
    role: 'user' | 'model'
    parts: { text: string }[]
}

/** 스트리밍 SSE 이벤트 데이터 */
export interface StreamEvent {
    text: string
    done: boolean
    fullResponse?: string
    error?: string
}
