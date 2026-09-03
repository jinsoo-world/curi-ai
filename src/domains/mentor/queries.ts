// domains/mentor — 멘토 데이터 조회

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MentorCardData } from './types'
import { createAdminClient } from '@/lib/supabase/admin'
import { findFallbackMentor as findFallback } from '@/lib/mentors-data'

/**
 * 활성 멘토 목록 조회 (Admin 클라이언트 우선)
 */
export async function getActiveMentors(): Promise<MentorCardData[]> {
    let db: SupabaseClient

    try {
        db = createAdminClient()
    } catch {
        // service_role key 없으면 일반 클라이언트는 호출측에서 전달
        console.warn('[Mentor Queries] Admin client unavailable, returning empty')
        return []
    }

    const { data, error } = await db
        .from('mentors')
        .select('id, name, title, description, avatar_url, expertise, greeting_message, sample_questions, voice_sample_url, voice_id')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    if (error) {
        console.error('[Mentor Queries] getActiveMentors error:', JSON.stringify(error))
        return []
    }
    return (data as MentorCardData[]) || []
}

/**
 * ID 또는 slug로 멘토 조회 (DB → slug → 폴백 순서)
 */
export async function getMentorById(
    db: SupabaseClient,
    mentorId: string,
) {
    // 1) ID로 조회
    const { data: byId, error } = await db
        .from('mentors')
        .select('*')
        .eq('id', mentorId)
        .single()

    if (byId && !error) return byId

    // 2) slug로 재시도
    const { data: bySlug } = await db
        .from('mentors')
        .select('*')
        .eq('slug', mentorId)
        .single()

    if (bySlug) return bySlug

    // 3) 폴백 데이터
    const fallback = findFallback(mentorId)
    if (fallback) {
        console.log(`[Mentor Queries] 폴백 멘토 데이터 사용: ${mentorId}`)
        return fallback
    }

    return null
}

/**
 * 공개 멘토 상세 조회 (목록과 같은 기준)
 *
 * 목록(getActiveMentors)은 관리자 권한 + is_active=true 로 뽑는데
 * 상세는 사용자 권한으로 뽑아, 목록엔 보이지만 누르면 404 인 카드가 생겼다.
 * (2026-09-04 실측: 「구글 문서 치트키」 등 2개. 줄은 살아 있고 is_active=true 인데
 *  사용자 권한 조회만 0행이었다.) 두 화면 기준을 하나로 맞춘다.
 */
export async function getPublicMentorById(mentorId: string) {
    let db: SupabaseClient
    try {
        db = createAdminClient()
    } catch {
        return null
    }

    const { data: byId } = await db
        .from('mentors')
        .select('*')
        .eq('id', mentorId)
        .eq('is_active', true)
        .maybeSingle()
    if (byId) return byId

    const { data: bySlug } = await db
        .from('mentors')
        .select('*')
        .eq('slug', mentorId)
        .eq('is_active', true)
        .maybeSingle()
    return bySlug ?? null
}

/**
 * 크리에이터(유저)가 만든 활성 멘토 목록 조회
 */
export async function getMentorsByCreator(
    db: SupabaseClient,
    userId: string,
): Promise<MentorCardData[]> {
    // creator_profiles에서 해당 유저의 creator_id 조회 후 멘토 목록
    const { data: creatorProfile } = await db
        .from('creator_profiles')
        .select('id')
        .eq('user_id', userId)
        .single()

    if (!creatorProfile) return []

    const { data, error } = await db
        .from('mentors')
        .select('id, name, title, description, avatar_url, expertise, greeting_message, sample_questions, voice_sample_url, voice_id')
        .eq('creator_id', creatorProfile.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[Mentor Queries] getMentorsByCreator error:', JSON.stringify(error))
        return []
    }
    return (data as MentorCardData[]) || []
}

/**
 * 멘토 프로필 상세 조회 (프로필 페이지용)
 * mentor + knowledge_sources + session count + creator info
 */
export async function getMentorProfile(mentorId: string) {
    const db = createAdminClient()

    // 1) 멘토 기본 정보
    const mentor = await getMentorById(db, mentorId)
    if (!mentor) return null

    // 2) 학습 지식 소스 (활성 + 처리 완료된 것만)
    const { data: knowledgeSources } = await db
        .from('knowledge_sources')
        .select('id, file_name, source_type, char_count, summary, status, created_at')
        .eq('mentor_id', mentor.id)
        .in('status', ['processed', 'active'])
        .order('created_at', { ascending: false })

    // 3) 대화 수 (sessions count)
    const { count: sessionCount } = await db
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('mentor_id', mentor.id)

    // 4) 크리에이터 정보
    let creatorInfo = null
    if (mentor.creator_id) {
        const { data: creator } = await db
            .from('creator_profiles')
            .select('user_id, display_name, bio, expertise, organization, job_title')
            .eq('id', mentor.creator_id)
            .single()

        if (creator) {
            // users 테이블에서 아바타
            const { data: userData } = await db
                .from('users')
                .select('avatar_url, email')
                .eq('id', creator.user_id)
                .single()

            creatorInfo = {
                ...creator,
                avatar_url: userData?.avatar_url || null,
            }
        }
    }

    return {
        mentor,
        knowledgeSources: knowledgeSources || [],
        sessionCount: sessionCount || 0,
        creatorInfo,
    }
}
