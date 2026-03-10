// domains/user — 유저 데이터 조회

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 유저 프로필 조회
 */
export async function getUserProfile(
    db: SupabaseClient,
    userId: string,
) {
    const { data, error } = await db
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

    if (error) {
        console.error('[User Queries] getUserProfile error:', JSON.stringify(error))
    }
    return data
}

/**
 * 채팅용 유저 컨텍스트 조회 (필요한 필드만)
 */
export async function getUserChatContext(
    db: SupabaseClient,
    userId: string,
) {
    const { data } = await db
        .from('users')
        .select('display_name, interests, birth_year, gender, concern, daily_free_used')
        .eq('id', userId)
        .single()

    return data
}

/**
 * handle로 유저 조회 (크리에이터 프로필 페이지용)
 */
export async function getUserByHandle(
    db: SupabaseClient,
    handle: string,
) {
    const { data, error } = await db
        .from('users')
        .select('id, display_name, avatar_url, handle')
        .eq('handle', handle)
        .single()

    if (error) {
        console.error('[User Queries] getUserByHandle error:', JSON.stringify(error))
    }
    return data
}

/**
 * handle 사용 가능 여부 (중복 체크)
 */
export async function isHandleAvailable(
    db: SupabaseClient,
    handle: string,
    excludeUserId?: string,
): Promise<boolean> {
    let query = db
        .from('users')
        .select('id')
        .eq('handle', handle)

    if (excludeUserId) {
        query = query.neq('id', excludeUserId)
    }

    const { data } = await query.maybeSingle()
    return !data
}
