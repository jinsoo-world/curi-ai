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
        .select('id, name, title, description, avatar_url, expertise, greeting_message, sample_questions')
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
