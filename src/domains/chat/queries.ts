// domains/chat — 채팅 데이터 조회

import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_MEMORY_ITEMS } from './constants'

/**
 * 유저의 멘토별 메모리 조회
 */
export async function getUserMemories(
    db: SupabaseClient,
    userId: string,
    mentorId: string,
) {
    const { data } = await db
        .from('user_memories')
        .select('content, memory_type')
        .eq('user_id', userId)
        .eq('mentor_id', mentorId)
        .order('updated_at', { ascending: false })
        .limit(MAX_MEMORY_ITEMS)

    return data as { content: string; memory_type: string }[] | null
}

/**
 * 채팅 세션 목록 조회
 */
export async function getChatSessions(
    db: SupabaseClient,
    userId: string,
    mentorId?: string,
) {
    let query = db
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('last_message_at', { ascending: false })

    if (mentorId) {
        query = query.eq('mentor_id', mentorId)
    }

    const { data, error } = await query
    if (error) {
        console.error('[Chat Queries] getChatSessions error:', JSON.stringify(error))
        return []
    }
    return data || []
}

/**
 * 세션의 메시지 히스토리 조회
 */
export async function getSessionMessages(
    db: SupabaseClient,
    sessionId: string,
) {
    const { data, error } = await db
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('[Chat Queries] getSessionMessages error:', JSON.stringify(error))
        return []
    }
    return data || []
}
