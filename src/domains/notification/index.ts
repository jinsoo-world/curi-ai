// domains/notification — 타입 및 쿼리

import type { SupabaseClient } from '@supabase/supabase-js'
import { isBotBlocked } from '@/domains/os/blocks'

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
    userId: string,
) {
    // 🔒 관리자 열쇠로 부르므로 주인 조건을 직접 건다 (남의 알림은 안 바뀐다)
    const { error } = await db
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', userId)

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
    // 🚫 차단한 봇은 먼저 말 걸지 않는다 (애플 심사 지침 1.2)
    if (await isBotBlocked(db, userId, mentorId)) return null
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

/**
 * 먼저 말 걸 사람 고르기 — 이미 받은(아직 안 읽은 proactive 알림이 있는) 사람을 먼저 거른 뒤 limit 명.
 * 예전엔 오래 안 온 사람 50명을 먼저 뽑고 그중 이미 받은 사람을 건너뛰어서, 같은 50명이 계속 뽑히고
 * 그 뒤 사람들은 영영 차례가 오지 않았다(2026-10-06 전수점검).
 */
export async function pickInactiveNotNudged(
    db: SupabaseClient,
    opts: { inactiveBefore: Date; limit?: number; pool?: number },
): Promise<{ id: string; display_name: string | null }[]> {
    const limit = opts.limit ?? 50
    const { data: candidates, error } = await db
        .from('users')
        .select('id, display_name')
        .lt('last_active_at', opts.inactiveBefore.toISOString())
        .order('last_active_at', { ascending: false })
        .limit(opts.pool ?? 500)
    if (error) throw new Error(error.message)
    const rows = (candidates ?? []) as { id: string; display_name: string | null }[]
    const already = new Set<string>()
    for (let i = 0; i < rows.length; i += 200) {
        const ids = rows.slice(i, i + 200).map(r => r.id)
        const { data, error: nErr } = await db
            .from('notifications')
            .select('user_id')
            .eq('type', 'proactive')
            .eq('is_read', false)
            .in('user_id', ids)
        if (nErr) throw new Error(nErr.message)
        for (const n of (data ?? []) as { user_id: string }[]) already.add(n.user_id)
    }
    return rows.filter(r => !already.has(r.id)).slice(0, limit)
}
