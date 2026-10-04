// domains/messaging — 캠페인·받지 않을 사람 명단의 실제 저장소(Supabase, service_role). 표 셋 = 20261013 마이그레이션.
//   message_campaigns       캠페인 한 줄 = 예약 한 줄
//   message_campaign_sends  (캠페인, 사람) 한 줄. 겹칠 수 없는 열쇠 = 같은 사람에게 두 번 안 간다
//   message_suppressions    받지 않을 사람 명단(지문만)

import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchWith } from './index'
import { CONSENT_COLUMN } from './consent'
import type { Campaign, CampaignRunStore, CampaignStatus, Recipient, SendStatus } from './campaign'
import type { DispatchInput } from './types'

type Row = {
    id: string; key: string; msg_type: string; route: Campaign['route']; title: string; body: string; deeplink: string | null
    audience: Campaign['audience']; status: CampaignStatus; recipient_count: number | null; send_at: string | null
    tested_at: string | null; approved_at: string | null; approved_by: string | null; approval_expires_at: string | null; cursor: string | null
}

export const CAMPAIGN_COLUMNS = 'id, key, msg_type, route, title, body, deeplink, audience, status, recipient_count, send_at, tested_at, approved_at, approved_by, approval_expires_at, cursor'

export function rowToCampaign(r: Row): Campaign {
    return {
        id: r.id, key: r.key, msgType: r.msg_type, route: r.route, title: r.title, body: r.body, deeplink: r.deeplink,
        audience: r.audience, status: r.status, recipientCount: r.recipient_count, sendAt: r.send_at, testedAt: r.tested_at,
        approvedAt: r.approved_at, approvedBy: r.approved_by, approvalExpiresAt: r.approval_expires_at, cursor: r.cursor,
    }
}

const SNAKE: Record<string, string> = {
    status: 'status', recipientCount: 'recipient_count', sendAt: 'send_at', testedAt: 'tested_at', approvedAt: 'approved_at',
    approvedBy: 'approved_by', approvalExpiresAt: 'approval_expires_at', cursor: 'cursor', sentAt: 'sent_at', lastError: 'last_error', stats: 'stats',
    title: 'title', body: 'body', deeplink: 'deeplink', audience: 'audience', route: 'route', msgType: 'msg_type',
}

export function patchToRow(patch: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const [k, v] of Object.entries(patch)) if (SNAKE[k] && v !== undefined) out[SNAKE[k]] = v
    if (patch.status === 'cancelled') out.cancelled_at = new Date().toISOString()
    if (patch.status === 'scheduled') out.scheduled_at = new Date().toISOString()
    return out
}

export async function getCampaign(db: SupabaseClient, id: string): Promise<Campaign | null> {
    const { data, error } = await db.from('message_campaigns').select(CAMPAIGN_COLUMNS).eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? rowToCampaign(data as unknown as Row) : null
}

/** 상태를 바꾼다. 다른 곳이 먼저 바꿨으면(상태가 달라졌으면) false */
export async function updateCampaignIf(db: SupabaseClient, id: string, fromStatus: CampaignStatus, patch: Record<string, unknown>): Promise<boolean> {
    const { data, error } = await db.from('message_campaigns').update(patchToRow(patch)).eq('id', id).eq('status', fromStatus).select('id')
    if (error) throw new Error(error.message)
    return (data ?? []).length > 0
}

/** 받을 사람 수(예약 때 30명 잠금 판정용). 동의한 사람 전체 = 그 채널 광고 동의 칸이 켜진 회원 */
export async function countAudience(db: SupabaseClient, c: Pick<Campaign, 'audience' | 'route'>): Promise<number> {
    if (c.audience.kind === 'user_ids') return c.audience.userIds.length
    const { count, error } = await db.from('users').select('id', { count: 'exact', head: true }).eq(CONSENT_COLUMN[c.route], true)
    if (error) throw new Error(error.message)
    return count ?? 0
}

export function createSupabaseCampaignStore(db: SupabaseClient): CampaignRunStore {
    return {
        async listDue(now) {
            const { data, error } = await db.from('message_campaigns').select(CAMPAIGN_COLUMNS)
                .in('status', ['scheduled', 'sending']).lte('send_at', now.toISOString()).order('send_at').limit(20)
            if (error) throw new Error(error.message)
            return ((data ?? []) as unknown as Row[]).map(rowToCampaign)
        },
        async claim(id, from) {
            const { data, error } = await db.from('message_campaigns').update({ status: 'sending', updated_at: new Date().toISOString() })
                .eq('id', id).in('status', from).select('id')
            if (error) throw new Error(error.message)
            return (data ?? []).length > 0
        },
        async nextRecipients(c, after, limit): Promise<Recipient[]> {
            let q = db.from('users').select('id, email').order('id').limit(limit)
            if (after) q = q.gt('id', after)
            if (c.audience.kind === 'user_ids') q = q.in('id', c.audience.userIds)
            else q = q.eq(CONSENT_COLUMN[c.route], true)
            const { data, error } = await q
            if (error) throw new Error(error.message)
            return ((data ?? []) as { id: string; email: string | null }[]).map(r => ({ userId: r.id, email: r.email }))
        },
        async reserve(campaignId, userId) {
            const { data, error } = await db.from('message_campaign_sends')
                .upsert({ campaign_id: campaignId, user_id: userId, status: 'pending' }, { onConflict: 'campaign_id,user_id', ignoreDuplicates: true })
                .select('user_id')
            if (error) throw new Error(error.message)
            return (data ?? []).length > 0
        },
        async record(campaignId, userId, status: SendStatus, reason) {
            const { error } = await db.from('message_campaign_sends').update({ status, reason: reason?.slice(0, 200) ?? null })
                .eq('campaign_id', campaignId).eq('user_id', userId)
            if (error) console.warn('[campaign] 기록 실패', error.message)
        },
        async update(id, patch) {
            const { error } = await db.from('message_campaigns').update(patchToRow(patch)).eq('id', id)
            if (error) throw new Error(error.message)
        },
    }
}

/** 캠페인 한 통을 관문 모양으로. 받는 사람 한 명 = 관문 한 번 */
export function campaignDispatchInput(c: Pick<Campaign, 'msgType' | 'route' | 'title' | 'body' | 'deeplink' | 'key'>, r: Recipient, test = false): DispatchInput {
    const base = { audience: 'self' as const, type: c.msgType, campaignKey: c.key, test: test || undefined }
    if (c.route === 'email') {
        return { ...base, message: { channel: 'email', userId: r.userId, to: r.email ?? undefined, subject: c.title, body: c.body } }
    }
    const message = { channel: 'push' as const, userId: r.userId, subject: c.title, body: c.body, url: c.deeplink && c.deeplink.startsWith('/') ? c.deeplink : undefined }
    return c.route === 'app_push' ? { ...base, message, appPush: { deeplink: c.deeplink && c.deeplink.startsWith('curiai://') ? c.deeplink : null } } : { ...base, message }
}

export function liveCampaignSender(db: SupabaseClient) {
    return async (c: Campaign, r: Recipient): Promise<{ status: SendStatus; reason: string | null }> => {
        const out = await dispatchWith(db, campaignDispatchInput(c, r))
        return { status: out.status, reason: out.status === 'sent' ? null : (out.pushReason ?? out.reason ?? out.error ?? null) }
    }
}
