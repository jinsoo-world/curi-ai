// domains/creator — 데이터 조회

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreatorProfile } from './types'

/**
 * 크리에이터 프로필 조회
 */
export async function getCreatorProfile(
    db: SupabaseClient,
    userId: string,
): Promise<CreatorProfile | null> {
    const { data, error } = await db
        .from('creator_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

    if (error) {
        console.error('[Creator] getCreatorProfile error:', error.message)
    }
    return data as CreatorProfile | null
}

/**
 * 내 AI 멘토 목록
 */
export async function getMyMentors(
    db: SupabaseClient,
    creatorId: string,
) {
    const { data, error } = await db
        .from('mentors')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[Creator] getMyMentors error:', error.message)
    }
    return data || []
}

/**
 * 멘토 상세 조회 (편집용)
 */
export async function getMentorForEdit(
    db: SupabaseClient,
    mentorId: string,
    creatorId: string,
) {
    const { data, error } = await db
        .from('mentors')
        .select('*, knowledge_sources(*)')
        .eq('id', mentorId)
        .eq('creator_id', creatorId)
        .single()

    if (error) {
        console.error('[Creator] getMentorForEdit error:', error.message)
    }
    return data
}
