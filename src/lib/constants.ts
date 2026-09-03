// 큐리 AI — 상수 정의

export const APP_CONFIG = {
    name: '큐리 AI',
    slogan: '언제든, 나를 아는 멘토에게 물어보세요',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
} as const

// 무료 사용 한도
export const FREE_TIER = {
    dailyChats: 5,
    maxMessagesPerSession: 50,
} as const

// 과금
export const PRICING = {
    monthly: { price: 9900, label: '월간 구독' },
    annual: { price: 99000, label: '연간 구독', discount: '17% 할인' },
    voice: { price: 19900, label: '보이스 멘토링' },
    chatTicket: { price: 3900, count: 30, label: '대화권 30회' },
    b2b: { price: 9900, label: 'B2B (인/월)' },
} as const

// AI 설정
export const AI_CONFIG = {
    model: 'gemini-3-flash-preview',
    maxTokens: 2048,
    temperature: 0.7,
    topP: 0.9,
} as const

// 채팅 UI
export const CHAT_CONFIG = {
    maxDisplayMessages: 100,
    typingDelay: 30, // ms per character for typing effect
    streamChunkSize: 5,
} as const
