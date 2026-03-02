export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || ''

// 페이지뷰 추적
export function pageview(url: string) {
    if (!GA_ID) return
    window.gtag('config', GA_ID, { page_path: url })
}

// 커스텀 이벤트 추적
export function event(action: string, params?: Record<string, string | number | boolean>) {
    if (!GA_ID) return
    window.gtag('event', action, params)
}

// ---- 큐리AI 전용 이벤트 헬퍼 ----

/** 멘토 선택 */
export function trackMentorSelect(mentorId: string, mentorName: string) {
    event('select_mentor', { mentor_id: mentorId, mentor_name: mentorName })
}

/** 채팅 메시지 전송 */
export function trackMessageSent(mentorId: string, sessionId: string) {
    event('send_message', { mentor_id: mentorId, session_id: sessionId })
}

/** 온보딩 완료 */
export function trackOnboardingComplete(interests: string[]) {
    event('onboarding_complete', { interests: interests.join(',') })
}

/** 구독 시작 (결제 연동 시) */
export function trackSubscribe(plan: string, amount: number) {
    event('subscribe', { plan, value: amount, currency: 'KRW' })
}

// gtag 타입 선언
declare global {
    interface Window {
        gtag: (...args: unknown[]) => void
        dataLayer: unknown[]
    }
}
