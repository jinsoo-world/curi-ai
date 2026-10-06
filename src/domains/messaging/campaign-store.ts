// domains/messaging — 캠페인·받지 않을 사람 명단의 실제 저장소(Supabase, service_role). 표 셋 = 20261013 마이그레이션.
//   message_campaigns       캠페인 한 줄 = 예약 한 줄
//   message_campaign_sends  (캠페인, 사람) 한 줄. 겹칠 수 없는 열쇠 = 같은 사람에게 두 번 안 간다
//   message_suppressions    받지 않을 사람 명단(지문만)

import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchWith } from './index'
import { CONSENT_COLUMN } from './consent'
import { PENDING_RETRY_MS } from './campaign'
import type { Campaign, CampaignRunStore, CampaignStatus, Recipient, SendStatus } from './campaign'
import type { DispatchInput } from './types'

type Row = {
    id: string; key: string; msg_type: string; route: Campaign['route']; title: string; body: string; deeplink: string | null
    audience: Campaign['audience']; status: CampaignStatus; recipient_count: number | null; send_at: string | null
    tested_at: string | null; approved_at: string | null; approved_by: string | null; approval_expires_at: string | null; cursor: string | null
    fail_count?: number | null
}

export const CAMPAIGN_COLUMNS = 'id, key, msg_type, route, title, body, deeplink, audience, status, recipient_count, send_at, tested_at, approved_at, approved_by, approval_expires_at, cursor, fail_count'
/** .in(...) 한 번에 넣는 회원 번호 수 (주소 길이 제한. 1,000개를 한 번에 넣으면 주소가 37KB 가 된다) */
export const IN_CHUNK = 200
/** 다른 실행이 잡은 지 이만큼 지났으면 죽은 실행으로 보고 다시 잡는다 */
const CLAIM_STALE_MS = 10 * 60_000

export function rowToCampaign(r: Row): Campaign {
    return {
        id: r.id, key: r.key, msgType: r.msg_type, route: r.route, title: r.title, body: r.body, deeplink: r.deeplink,
        audience: r.audience, status: r.status, recipientCount: r.recipient_count, sendAt: r.send_at, testedAt: r.tested_at,
        approvedAt: r.approved_at, approvedBy: r.approved_by, approvalExpiresAt: r.approval_expires_at, cursor: r.cursor,
        failCount: r.fail_count ?? 0,
    }
}

const SNAKE: Record<string, string> = {
    status: 'status', recipientCount: 'recipient_count', sendAt: 'send_at', testedAt: 'tested_at', approvedAt: 'approved_at',
    approvedBy: 'approved_by', approvalExpiresAt: 'approval_expires_at', cursor: 'cursor', sentAt: 'sent_at', lastError: 'last_error', stats: 'stats',
    title: 'title', body: 'body', deeplink: 'deeplink', audience: 'audience', route: 'route', msgType: 'msg_type',
    failCount: 'fail_count', claimedAt: 'claimed_at', nextRunAt: 'next_run_at',
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
            // 상태 + 차지(claimed_at) 둘 다 본다 = 예약 작업과 「지금 보내기」가 같은 캠페인을 동시에 못 돌린다
            const now = new Date()
            const stale = new Date(now.getTime() - CLAIM_STALE_MS).toISOString()
            const { data, error } = await db.from('message_campaigns')
                .update({ status: 'sending', claimed_at: now.toISOString(), updated_at: now.toISOString() })
                .eq('id', id).in('status', from)
                .or(`claimed_at.is.null,claimed_at.lt."${stale}"`)
                .select('id')
            if (error) throw new Error(error.message)
            return (data ?? []).length > 0
        },
        async nextRecipients(c, after, limit): Promise<Recipient[]> {
            if (c.audience.kind === 'user_ids') {
                // 회원 번호 목록은 우리가 정렬해 커서 뒤 limit 개만 골라 200개씩 나눠 묻는다
                const ids = [...c.audience.userIds].map(x => x.toLowerCase()).sort().filter(id => !after || id > after).slice(0, limit)
                const out: Recipient[] = []
                for (let i = 0; i < ids.length; i += IN_CHUNK) {
                    const { data, error } = await db.from('users').select('id, email').in('id', ids.slice(i, i + IN_CHUNK)).order('id')
                    if (error) throw new Error(error.message)
                    for (const r of (data ?? []) as { id: string; email: string | null }[]) out.push({ userId: r.id, email: r.email })
                }
                return out.sort((x, y) => (x.userId < y.userId ? -1 : x.userId > y.userId ? 1 : 0))
            }
            let q = db.from('users').select('id, email').order('id').limit(limit)
            if (after) q = q.gt('id', after)
            q = q.eq(CONSENT_COLUMN[c.route], true)
            const { data, error } = await q
            if (error) throw new Error(error.message)
            return ((data ?? []) as { id: string; email: string | null }[]).map(r => ({ userId: r.id, email: r.email }))
        },
        async reserve(campaignId, userId) {
            const { data, error } = await db.from('message_campaign_sends')
                .upsert({ campaign_id: campaignId, user_id: userId, status: 'pending' }, { onConflict: 'campaign_id,user_id', ignoreDuplicates: true })
                .select('user_id')
            if (error) throw new Error(error.message)
            if ((data ?? []).length > 0) return true
            // 이미 줄이 있다. 1시간 넘게 pending 이면(보내다 함수가 죽음) 시각을 새로 찍으며 다시 잡는다(한 곳만 잡힌다)
            const before = new Date(Date.now() - PENDING_RETRY_MS).toISOString()
            const { data: again, error: e2 } = await db.from('message_campaign_sends')
                .update({ created_at: new Date().toISOString() })
                .eq('campaign_id', campaignId).eq('user_id', userId).eq('status', 'pending').lt('created_at', before)
                .select('user_id')
            if (e2) throw new Error(e2.message)
            return (again ?? []).length > 0
        },
        async stalePending(campaignId, before) {
            const { data, error } = await db.from('message_campaign_sends')
                .update({ created_at: new Date().toISOString() })
                .eq('campaign_id', campaignId).eq('status', 'pending').lt('created_at', before.toISOString())
                .select('user_id')
            if (error) throw new Error(error.message)
            const ids = ((data ?? []) as { user_id: string }[]).map(r => r.user_id)
            const out: Recipient[] = []
            for (let i = 0; i < ids.length; i += IN_CHUNK) {
                const { data: users, error: ue } = await db.from('users').select('id, email').in('id', ids.slice(i, i + IN_CHUNK))
                if (ue) throw new Error(ue.message)
                for (const u of (users ?? []) as { id: string; email: string | null }[]) out.push({ userId: u.id, email: u.email })
            }
            return out
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
