// domains/push — Supabase 로 읽고 쓰는 실제 저장소. 표 둘(push_devices, push_sends)은 서버 전용(RLS 켬, 정책 없음).

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_PREFS } from '@/domains/messaging/types'
import type { ApnsEnv, Platform, PushSendRow, PushStore } from './types'

type Db = Pick<SupabaseClient, 'from'>

export function createSupabasePushStore(db: Db): PushStore {
    return {
        async listDevices(userId) {
            const { data, error } = await db.from('push_devices')
                .select('id, user_id, platform, token, apns_env')
                .eq('user_id', userId).is('disabled_at', null)
            if (error) throw new Error(error.message)
            return ((data ?? []) as { id: string; user_id: string; platform: Platform; token: string; apns_env: ApnsEnv | null }[])
                .map(r => ({ id: r.id, userId: r.user_id, platform: r.platform, token: r.token, apnsEnv: r.apns_env }))
        },

        async countSentBatches(userId, since, category) {
            let q = db.from('push_sends').select('batch_id')
                .eq('user_id', userId).eq('status', 'sent').gte('sent_at', since.toISOString())
            if (category) q = q.eq('category', category)
            const { data, error } = await q.limit(500)
            if (error) throw new Error(error.message)
            return new Set(((data ?? []) as { batch_id: string }[]).map(r => r.batch_id)).size
        },

        async hasSent(userId, type, key, since) {
            let q = db.from('push_sends').select('id')
                .eq('user_id', userId).eq('push_type', type).eq('dedupe_key', key).neq('status', 'blocked')
            if (since) q = q.gte('sent_at', since.toISOString())
            const { data, error } = await q.limit(1)
            if (error) throw new Error(error.message)
            return (data ?? []).length > 0
        },

        async hasMarketingConsent(userId) {
            // 큐리AI 광고 수신 동의 = users.marketing_consent (가입 화면·내 정보에서 켬, 기본 false). 못 읽으면 동의 없음으로 본다
            const { data, error } = await db.from('users').select('marketing_consent').eq('id', userId).maybeSingle()
            if (error) return false
            return (data as { marketing_consent?: boolean | null } | null)?.marketing_consent === true
        },

        async getPrefs(userId) {
            const { data, error } = await db.from('notification_prefs')
                .select('push, quiet_from, quiet_to').eq('user_id', userId).maybeSingle()
            const row = (error ? null : data) as { push: boolean; quiet_from: string | null; quiet_to: string | null } | null
            return {
                push: row?.push ?? DEFAULT_PREFS.push,
                quietFrom: row?.quiet_from ?? DEFAULT_PREFS.quietFrom,
                quietTo: row?.quiet_to ?? DEFAULT_PREFS.quietTo,
            }
        },

        async insertSends(rows: PushSendRow[]) {
            const { error } = await db.from('push_sends').insert(rows.map(r => ({
                id: r.id,
                user_id: r.userId,
                device_id: r.deviceId,
                batch_id: r.batchId,
                push_type: r.pushType,
                category: r.category,
                title: r.title,
                body: r.body,
                deeplink: r.deeplink,
                dedupe_key: r.dedupeKey,
                status: r.status,
                error: r.error,
            })))
            if (error) throw new Error(error.message)
        },

        async disableDevice(deviceId, reason) {
            const { error } = await db.from('push_devices')
                .update({ disabled_at: new Date().toISOString(), disabled_reason: reason.slice(0, 120) })
                .eq('id', deviceId)
            if (error) throw new Error(error.message)
        },
    }
}
