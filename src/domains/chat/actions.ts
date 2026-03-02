// domains/chat — 채팅 데이터 변경 액션

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 유저 메시지 저장
 */
export async function saveUserMessage(
    db: SupabaseClient,
    sessionId: string,
    content: string,
) {
    const { error } = await db.from('messages').insert({
        session_id: sessionId,
        role: 'user',
        content,
    })
    if (error) {
        console.error('[Chat Actions] saveUserMessage error:', JSON.stringify(error))
    }
}

/**
 * AI 응답 메시지 저장
 */
export async function saveAssistantMessage(
    db: SupabaseClient,
    sessionId: string,
    content: string,
) {
    const { error } = await db.from('messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content,
    })
    if (error) {
        console.error('[Chat Actions] saveAssistantMessage error:', JSON.stringify(error))
    }
}

/**
 * 세션 메시지 카운트 + 마지막 메시지 시간 업데이트
 */
export async function updateSessionActivity(
    db: SupabaseClient,
    sessionId: string,
    messageCount: number,
) {
    const { error } = await db
        .from('chat_sessions')
        .update({
            message_count: messageCount,
            last_message_at: new Date().toISOString(),
        })
        .eq('id', sessionId)

    if (error) {
        console.error('[Chat Actions] updateSessionActivity error:', JSON.stringify(error))
    }
}

/**
 * 일일 무료 사용 카운트 증가
 * - 자정 지나면 카운트 리셋
 * - RPC 없이 직접 UPDATE
 */
export async function incrementDailyFreeUsage(
    db: SupabaseClient,
    userId: string,
    currentCount: number,
) {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    // 먼저 리셋 날짜 확인 — 오늘 이전이면 카운트 리셋
    const { data: userData } = await db
        .from('users')
        .select('daily_free_reset_at')
        .eq('id', userId)
        .single()

    const resetAt = userData?.daily_free_reset_at ? new Date(userData.daily_free_reset_at) : null
    const needsReset = !resetAt || resetAt < new Date(todayStart)

    const newCount = needsReset ? 1 : currentCount + 1

    const { error } = await db
        .from('users')
        .update({
            daily_free_used: newCount,
            daily_free_reset_at: needsReset ? now.toISOString() : undefined,
        })
        .eq('id', userId)

    if (error) {
        console.error('[Chat Actions] incrementDailyFreeUsage error:', JSON.stringify(error))
    }
}

/**
 * 새 채팅 세션 생성
 */
export async function createChatSession(
    db: SupabaseClient,
    userId: string,
    mentorId: string,
    title?: string,
) {
    const { data, error } = await db
        .from('chat_sessions')
        .insert({
            user_id: userId,
            mentor_id: mentorId,
            title: title || null,
            message_count: 0,
        })
        .select()
        .single()

    if (error) {
        console.error('[Chat Actions] createChatSession error:', JSON.stringify(error))
        return null
    }
    return data
}
