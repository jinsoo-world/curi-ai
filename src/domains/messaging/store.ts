// domains/messaging — Supabase 로 읽고 쓰는 실제 저장소. db 는 service_role 이라 user_id 를 여기서 꼭 건다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_PREFS } from './types'
import type { MessageLogEntry, MessagingStore, NotificationPrefs } from './types'

/** 표가 아직 없을 때 나는 Postgres 오류 번호 */
export const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다

type PrefsRow = { push: boolean; sms: boolean; email: boolean; quiet_from: string | null; quiet_to: string | null }

export function rowToPrefs(row: PrefsRow | null | undefined): NotificationPrefs {
    if (!row) return { ...DEFAULT_PREFS }
    return {
        push: row.push,
        sms: row.sms,
        email: row.email,
        quietFrom: row.quiet_from ?? DEFAULT_PREFS.quietFrom,
        quietTo: row.quiet_to ?? DEFAULT_PREFS.quietTo,
    }
}

export function createSupabaseStore(db: SupabaseClient): MessagingStore {
    return {
        async getApprovedRequest(id, userId) {
            const { data, error } = await db
                .from('permission_requests')
                .select('id, user_id, status')
                .eq('id', id)
                .eq('user_id', userId)
                .in('status', ['allowed', 'edited_allowed'])
                .maybeSingle()
            if (error || !data) return null
            return { id: data.id as string, userId: data.user_id as string }
        },

        async getPrefs(userId) {
            const { data, error } = await db
                .from('notification_prefs')
                .select('push, sms, email, quiet_from, quiet_to')
                .eq('user_id', userId)
                .maybeSingle()
            if (error) {
                if (error.code !== TABLE_MISSING) console.warn('[messaging] 설정 읽기 실패', error.message)
                return { ...DEFAULT_PREFS }
            }
            return rowToPrefs(data as PrefsRow | null)
        },

        async log(entry: MessageLogEntry) {
            const { error } = await db.from('message_log').insert({
                user_id: entry.userId,
                channel: entry.channel,
                to_hint: entry.toHint,
                subject: entry.subject,
                status: entry.status,
                permission_request_id: entry.permissionRequestId,
                error: entry.error,
            })
            if (error) throw new Error(error.message)
        },
    }
}

/** 설정 저장(없으면 만든다). 고칠 칸만 넣는다 */
export async function savePrefs(db: SupabaseClient, userId: string, patch: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    const cur = await createSupabaseStore(db).getPrefs(userId)
    const next: NotificationPrefs = { ...cur, ...patch }
    const { error } = await db.from('notification_prefs').upsert({
        user_id: userId,
        push: next.push,
        sms: next.sms,
        email: next.email,
        quiet_from: next.quietFrom,
        quiet_to: next.quietTo,
    }, { onConflict: 'user_id' })
    if (error) throw new Error((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST) ? 'notification_prefs 표가 아직 없다. supabase/migrations/20260927_messaging.sql 을 실행해야 한다' : error.message)
    return next
}
