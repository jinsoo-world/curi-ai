// 인사이트 도메인 타입 정의

export interface Insight {
    id: string
    user_id: string
    session_id: string
    mentor_id: string
    title: string
    content: string
    tags: string[]
    mentor_name: string
    created_at: string
}

export interface InsightCreateInput {
    sessionId: string
    mentorId: string
    mentorName: string
    messages: { role: string; content: string }[]
}

export type { }
