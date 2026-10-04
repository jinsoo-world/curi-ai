// domains/messaging — Supabase 로 읽고 쓰는 실제 저장소. db 는 service_role 이라 user_id 를 여기서 꼭 건다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_PREFS } from './types'
import type { AdProfile, MessageLogEntry, MessagingStore, NotificationPrefs } from './types'
import { CONSENT_COLUMN, splitConsent, type SuppressionRow } from './consent'
import { ROUTES } from './registry'

/** 표가 아직 없을 때 나는 Postgres 오류 번호 */
export const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다
const COLUMN_MISSING = new Set(['42703', 'PGRST204'])   // 칸이 없을 때 Postgres / PostgREST 코드
const isTableMissing = (code: string | undefined) => code === TABLE_MISSING || code === TABLE_MISSING_REST

/** 메시지엔진 1차(20261013)에서 message_log 에 더한 칸. 마이그레이션 전 DB 에서는 빼고 다시 적는다 */
const ENGINE_COLUMNS = ['msg_type', 'category', 'route', 'campaign_key', 'dedupe_key', 'batch_id', 'is_test'] as const

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
            const row: Record<string, unknown> = {
                user_id: entry.userId,
                channel: entry.channel,
                to_hint: entry.toHint,
                subject: entry.subject,
                status: entry.status,
                permission_request_id: entry.permissionRequestId,
                error: entry.error,
                msg_type: entry.msgType ?? null,
                category: entry.category ?? null,
                route: entry.route ?? null,
                campaign_key: entry.campaignKey ?? null,
                dedupe_key: entry.dedupeKey ?? null,
                batch_id: entry.batchId ?? null,
                is_test: entry.isTest === true,
            }
            if (entry.toHash) row.to_hash = entry.toHash
            let { error } = await db.from('message_log').insert(row)
            // 칸이 아직 없으면(마이그레이션 전) 없는 칸만 빼고 다시 적는다. 기록이 사라지면 상한을 못 센다
            //   to_hash 가 없다 → 지문만 뺀다 / 그 밖의 칸이 없다 → 메시지엔진 칸을 뺀다
            for (let i = 0; i < 2 && error && COLUMN_MISSING.has(error.code); i++) {
                if ('to_hash' in row && /to_hash/.test(error.message ?? '')) delete row.to_hash
                else if (ENGINE_COLUMNS.some(c => c in row)) for (const c of ENGINE_COLUMNS) delete row[c]
                else if ('to_hash' in row) delete row.to_hash
                else break
                ;({ error } = await db.from('message_log').insert(row))
            }
            if (error) throw new Error(error.message)
        },

        async getTypeSwitch(type) {
            const { data, error } = await db.from('message_types').select('enabled').eq('type', type).maybeSingle()
            if (error) {
                if (isTableMissing(error.code)) return null
                throw new Error(error.message)
            }
            const v = (data as { enabled?: boolean | null } | null)?.enabled
            return typeof v === 'boolean' ? v : null
        },

        async getAdProfile(userId): Promise<AdProfile> {
            const cols = ROUTES.map(r => CONSENT_COLUMN[r])
            const { data, error } = await db.from('users')
                .select(['email', 'phone', 'marketing_consent', 'ad_consent_updated_at', ...cols].join(', '))
                .eq('id', userId).maybeSingle()
            if (error && COLUMN_MISSING.has(error.code)) {
                // 채널 칸 마이그레이션 전: 옛 한 칸을 네 칸으로 나눠 본다
                const old = await db.from('users').select('email, phone, marketing_consent').eq('id', userId).maybeSingle()
                if (old.error) throw new Error(old.error.message)
                const r = old.data as { email?: string | null; phone?: string | null; marketing_consent?: boolean | null } | null
                return { consent: splitConsent(r?.marketing_consent), consentAt: null, email: r?.email ?? null, phone: r?.phone ?? null }
            }
            if (error) throw new Error(error.message)
            const r = (data ?? null) as Record<string, unknown> | null
            const consent = Object.fromEntries(ROUTES.map(route => [route, r?.[CONSENT_COLUMN[route]] === true])) as AdProfile['consent']
            return {
                consent,
                consentAt: typeof r?.ad_consent_updated_at === 'string' ? r.ad_consent_updated_at : null,
                email: typeof r?.email === 'string' ? r.email : null,
                phone: typeof r?.phone === 'string' ? r.phone : null,
            }
        },

        async findSuppressions(hashes, channels) {
            if (hashes.length === 0) return []
            const { data, error } = await db.from('message_suppressions')
                .select('channel, reason, scope, created_at')
                .in('address_hash', hashes).in('channel', channels).limit(50)
            if (error) {
                if (isTableMissing(error.code)) return []
                throw new Error(error.message)
            }
            return (data ?? []) as SuppressionRow[]
        },

        async countSent(userId, since, category) {
            let q = db.from('message_log').select('id', { count: 'exact', head: true })
                .eq('user_id', userId).eq('status', 'sent').is('permission_request_id', null)
                .gte('created_at', since.toISOString())
                .not('is_test', 'is', true)
                .or('msg_type.is.null,msg_type.neq.TEST')
            if (category) q = q.eq('category', category)
            const { count, error } = await q
            if (error && COLUMN_MISSING.has(error.code)) {
                // 메시지엔진 칸 마이그레이션(20261013) 전: 정보/광고를 가를 수 없다.
                //   전체 = 옛 칸으로 센다(시험 알림 「[TEST] …」은 뺀다) / 광고 = 0 (앱 푸시 광고는 sendPush 가 push_sends 로 따로 센다)
                if (category === 'ad') return 0
                const old = await db.from('message_log').select('id', { count: 'exact', head: true })
                    .eq('user_id', userId).eq('status', 'sent').is('permission_request_id', null)
                    .gte('created_at', since.toISOString()).not('subject', 'like', '[TEST]%')
                if (old.error) throw new Error(old.error.message)
                return old.count ?? 0
            }
            if (error) throw new Error(error.message)
            return count ?? 0
        },

        async hasSent(userId, type, key, since) {
            let q = db.from('message_log').select('id')
                .eq('user_id', userId).eq('msg_type', type).eq('dedupe_key', key).eq('status', 'sent')
            if (since) q = q.gte('created_at', since.toISOString())
            const { data, error } = await q.limit(1)
            // 마이그레이션 전엔 겹침 열쇠 칸이 없다 = 모른다. 앱 푸시는 sendPush 가 push_sends 로 겹침을 한 번 더 막는다
            if (error && COLUMN_MISSING.has(error.code)) return false
            if (error) throw new Error(error.message)
            return (data ?? []).length > 0
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
