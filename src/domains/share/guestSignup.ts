/**
 * 공유 링크로 들어온 손님이 가입할 때 쓰는 규칙.
 * 가입 뒤 같은 봇 대화로 돌아오게 next 에 지금 주소(?ref=, utm 포함)를 그대로 담는다.
 */
import { safeNextPath } from '@/lib/safe-next'

/** 손님이 이만큼 보내면 가입 안내 카드를 띄운다 (보내기는 막지 않는다) */
export const GUEST_SIGNUP_NUDGE_AT = 3

export const GUEST_SIGNUP_COPY = {
    title: '이어서 대화하려면 3초 만에 가입해요',
    body: '가입하면 지금 이 봇과 계속 이야기할 수 있어요',
    kakao: '카카오로 시작하기',
    google: '구글로 시작하기',
} as const

export function buildGuestLoginUrl(provider: 'kakao' | 'google', returnPath: string): string {
    const next = safeNextPath(returnPath) ?? '/os'
    return `/login?provider=${provider}&next=${encodeURIComponent(next)}`
}

/** sentCount = 이번에 보낸 것까지 센 손님 메시지 수 */
export function shouldShowGuestSignupCard(o: { isGuest: boolean; sentCount: number; limit: number }): boolean {
    if (!o.isGuest) return false
    return o.sentCount >= Math.min(GUEST_SIGNUP_NUDGE_AT, o.limit)
}

/** 새 가입자는 온보딩(/os/start)을 거친다. 원래 가려던 곳을 온보딩 주소에 실어 보낸다 */
export function onboardingPathWithNext(onboardingPath: string, next: string | null): string {
    const safe = safeNextPath(next)
    if (!safe || safe === '/os' || safe.startsWith(onboardingPath)) return onboardingPath
    return `${onboardingPath}?next=${encodeURIComponent(safe)}`
}
