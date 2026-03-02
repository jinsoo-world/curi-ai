// domains/notification — 타입 및 쿼리

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Notification {
    id: string
    user_id: string
    mentor_id: string | null
    type: 'proactive' | 'system' | 'promotion'
    message: string
    is_read: boolean
    created_at: string
}

/**
 * 사용자의 읽지 않은 알림 가져오기
 */
export async function getUnreadNotifications(
    db: SupabaseClient,
    userId: string,
): Promise<Notification[]> {
    const { data, error } = await db
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(10)

    if (error) {
        console.error('[Notification] getUnread error:', error)
        return []
    }

    return data || []
}

/**
 * 알림을 읽음 처리
 */
export async function markNotificationRead(
    db: SupabaseClient,
    notificationId: string,
) {
    const { error } = await db
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)

    if (error) {
        console.error('[Notification] markRead error:', error)
    }
}

/**
 * 프로액티브 알림 생성
 */
export async function createProactiveNotification(
    db: SupabaseClient,
    userId: string,
    mentorId: string,
    message: string,
) {
    const { data, error } = await db
        .from('notifications')
        .insert({
            user_id: userId,
            mentor_id: mentorId,
            type: 'proactive',
            message,
        })
        .select()
        .single()

    if (error) {
        console.error('[Notification] create error:', error)
        return null
    }

    return data
}
