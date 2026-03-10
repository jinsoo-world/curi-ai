// domains/user — 유저 도메인 타입 정의

export type { User } from '@/types'

/** 온보딩 데이터 (클라이언트 → 서버) */
export interface OnboardingData {
    display_name?: string
    interests?: string[]
    birth_year?: string | number
    gender?: string
}

/** 프로필 업데이트 데이터 */
export interface ProfileUpdateData {
    display_name?: string | null
    interests?: string[]
    birth_year?: number | null
    gender?: string | null
    handle?: string | null
    avatar_url?: string | null
    phone?: string | null
    marketing_consent?: boolean | null
}

/** 프로필 응답 데이터 */
export interface ProfileResponse {
    profile: Record<string, unknown> | null
    google_name: string | null
    google_avatar: string | null
}
