// domains/mentor — 멘토 도메인 타입 정의

export type { Mentor } from '@/types'

/** 멘토 카드 (목록 페이지용) */
export interface MentorCardData {
    id: string
    name: string
    title: string
    description: string
    avatar_url: string
    expertise: string[]
    greeting_message: string
    sample_questions: string[]
    voice_sample_url?: string | null
}
