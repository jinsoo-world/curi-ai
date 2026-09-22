// domains/chat — 외부 노출 API

export * from './types'
export * from './constants'
// 대화 답은 stream.ts 가 드라이버(솔라/Gemini)를 골라 흘려준다. gemini.ts 를 직접 쓰지 않는다.
export { generateChatStream, UNAVAILABLE_TEXT } from './stream'
export {
    getUserMemories,
    getChatSessions,
    getSessionMessages,
} from './queries'
export {
    saveUserMessage,
    saveAssistantMessage,
    updateSessionActivity,
    incrementDailyFreeUsage,
    createChatSession,
} from './actions'
export {
    detectCrisisKeywords,
    CRISIS_RESPONSE,
    ERROR_MESSAGES,
} from './guardrail'
export { generateSuggestions } from './suggestions'
export { extractAndSaveMemories } from './memory'
export { extractAndUpdateTopic } from './topic'
