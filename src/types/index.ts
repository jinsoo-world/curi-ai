// 큐리 AI — 핵심 타입 정의

// ============================================
// 유저 관련
// ============================================
export interface User {
    id: string
    email: string
    display_name: string | null
    avatar_url: string | null
    handle: string | null
    birth_year: number | null
    gender: 'male' | 'female' | 'other' | null
    interests: string[]
    membership_tier: 'free' | 'subscriber' | 'vip'
    anonymous_session_id: string | null
    onboarding_completed: boolean
    created_at: string
    updated_at: string
}

// ============================================
// 멘토 관련
// ============================================
export interface Mentor {
    id: string
    name: string
    slug: string
    title: string
    description: string
    avatar_url: string
    expertise: string[]
    personality_traits: string[]
    system_prompt: string
    greeting_message: string
    sample_questions: string[]
    voice_id: string | null // ElevenLabs voice ID
    is_active: boolean
    sort_order: number
    created_at: string
}

// ============================================
// 채팅 관련
// ============================================
export interface ChatSession {
    id: string
    user_id: string
    mentor_id: string
    title: string | null
    message_count: number
    last_message_at: string | null
    proactive_sent_at: string | null
    created_at: string
}

export interface Message {
    id: string
    session_id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    input_method: 'text' | 'stt'
    tokens_used: number | null
    created_at: string
}

// ============================================
// CRM / 메모리
// ============================================
export interface UserMemory {
    id: string
    user_id: string
    mentor_id: string | null
    memory_type: 'summary' | 'fact' | 'preference' | 'context'
    content: string
    confidence: number
    source_message_id: string | null
    created_at: string
    updated_at: string
}

// ============================================
// 구독 / 과금
// ============================================
export interface Subscription {
    id: string
    user_id: string
    plan_type: 'monthly' | 'annual'
    status: 'active' | 'canceled' | 'expired' | 'trial'
    current_period_start: string
    current_period_end: string
    toss_subscription_id: string | null
    created_at: string
}

export interface ConversationCredit {
    user_id: string
    remaining_credits: number
    daily_free_used: number
    daily_free_reset_at: string
}

// ============================================
// 지식 소스 (RAG)
// ============================================
export interface KnowledgeSource {
    id: string
    mentor_id: string
    source_type: 'pdf' | 'url' | 'youtube' | 'text'
    title: string
    content: string | null
    embedding_status: 'pending' | 'processing' | 'completed' | 'failed'
    created_at: string
}

// ============================================
// API 응답
// ============================================
export interface ApiResponse<T> {
    data: T | null
    error: string | null
    status: number
}

// ============================================
// 앱 상태 (Zustand)
// ============================================
export interface AppState {
    user: User | null
    currentMentor: Mentor | null
    currentSession: ChatSession | null
    messages: Message[]
    isStreaming: boolean
    sidebarOpen: boolean

    // Actions
    setUser: (user: User | null) => void
    setCurrentMentor: (mentor: Mentor | null) => void
    setCurrentSession: (session: ChatSession | null) => void
    setMessages: (messages: Message[]) => void
    addMessage: (message: Message) => void
    setIsStreaming: (isStreaming: boolean) => void
    toggleSidebar: () => void
}
