// domains/messaging — 캠페인(여러 명에게 한 번에) 절차 (메시지엔진 설계서 1002 4-6, 1차 6번).
//
// 상태: draft(초안) → test_sent(대표 기기로 시험) → approved(대표 승인, 3시간 뒤 꺼짐) → scheduled(예약 = 표 한 줄)
//       → sending(보내는 중) → sent(보냄)   ·   언제든 cancelled(취소)
//   - 30명 넘는 캠페인은 approved 없이 scheduled 로 못 간다. 승인은 3시간 뒤 꺼지고, 예약 시각도 그 3시간 안이어야 한다.
//   - 30명 이하도 시험(test_sent)은 거친다.
//   - 시험·승인은 승인권자(기본 jin@mission-driven.kr, MSG_CAMPAIGN_APPROVERS)만 누른다. 시험은 누른 사람 자신에게만 간다.
//   - 문안을 고치면 초안으로 돌아간다(시험·승인이 지워진다).
//   - 예약은 크론 줄이 아니라 표 한 줄(send_at). 예약 작업 하나(api/cron/campaigns)와 관리자 「지금 보내기」가 시각이 된 줄만 보낸다.
//   - 보냄(sent)은 다시 안 보낸다. 같은 캠페인 + 같은 사람은 message_campaign_sends 의 겹칠 수 없는 열쇠가 막는다(컴퓨터가 몇 대든).
//   - 멈춤 스위치: MSG_CAMPAIGNS_ENABLED 가 0·false·off 면 시험·예약·보내기가 전부 멈춘다.
//   - 받는 사람 한 명 한 명은 관문(dispatch)을 지난다 = 동의·명단·상한·광고 시간이 그대로 걸린다.

import { getTypeDef, type Route } from './registry'
import { hasAdPrefix, hasUnsubscribePlaceholder } from './rules'

export type CampaignStatus = 'draft' | 'test_sent' | 'approved' | 'scheduled' | 'sending' | 'sent' | 'cancelled'
export type CampaignAudience = { kind: 'consented' } | { kind: 'user_ids'; userIds: string[] }

export const LOCK_THRESHOLD = 30
export const APPROVAL_TTL_MS = 3 * 60 * 60 * 1000
export const MAX_USER_IDS = 1000
export const CAMPAIGN_KEY_RE = /^(\d{2})(\d{2})(\d{2})_[a-z0-9][a-z0-9-]{0,39}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Campaign {
    id: string
    key: string
    msgType: string
    route: Route
    title: string
    body: string
    deeplink: string | null
    audience: CampaignAudience
    status: CampaignStatus
    recipientCount: number | null
    sendAt: string | null
    testedAt: string | null
    approvedAt: string | null
    approvedBy: string | null
    approvalExpiresAt: string | null
    cursor: string | null
}

export interface DraftInput {
    key: unknown
    msgType: unknown
    route: unknown
    title: unknown
    body: unknown
    deeplink?: unknown
    audience: unknown
}

export type DraftValue = Pick<Campaign, 'key' | 'msgType' | 'route' | 'title' | 'body' | 'deeplink' | 'audience'>

/** 멈춤 스위치. 값이 없으면 켬, 0·false·off 면 멈춤 */
export function campaignsEnabled(v = process.env.MSG_CAMPAIGNS_ENABLED): boolean {
    return !(v && /^(0|false|off)$/i.test(v.trim()))
}

export function approvers(v = process.env.MSG_CAMPAIGN_APPROVERS): string[] {
    const list = (v ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    return list.length ? list : ['jin@mission-driven.kr']
}

export function isApprover(email: string | null | undefined, list = approvers()): boolean {
    return !!email && list.includes(email.trim().toLowerCase())
}

function validKeyDate(key: string): boolean {
    const m = CAMPAIGN_KEY_RE.exec(key)
    if (!m) return false
    const [y, mo, d] = [2000 + Number(m[1]), Number(m[2]), Number(m[3])]
    const dt = new Date(Date.UTC(y, mo - 1, d))
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

/** 캠페인 초안 검사. 캠페인 열쇠 {YYMMDD}_{짧은이름} · 캠페인 유형 · 채널 · 광고 표시 · 대상 */
export function validateDraft(i: DraftInput): { ok: true; value: DraftValue } | { ok: false; error: string } {
    const key = typeof i.key === 'string' ? i.key.trim() : ''
    if (!validKeyDate(key)) return { ok: false, error: '캠페인 열쇠는 「YYMMDD_짧은이름」 모양이어야 해요(영어 소문자·숫자·-). 예: 261004_newbot' }
    const def = getTypeDef(typeof i.msgType === 'string' ? i.msgType : null)
    if (!def || def.audience !== 'campaign') return { ok: false, error: '캠페인 유형(CAMPAIGN_…)을 골라 주세요' }
    const route = i.route as Route
    if (!def.routes.includes(route) || route === 'sms') return { ok: false, error: '이 유형이 쓰지 않는 채널이에요' }
    const title = typeof i.title === 'string' ? i.title.trim() : ''
    const body = typeof i.body === 'string' ? i.body.trim() : ''
    if (!title || title.length > 80) return { ok: false, error: '제목은 1~80자' }
    if (!body || body.length > (route === 'email' ? 5000 : 300)) return { ok: false, error: route === 'email' ? '본문은 1~5000자' : '본문은 1~300자' }
    if (def.category === 'ad' && !hasAdPrefix(title)) return { ok: false, error: '광고는 제목이 「(광고)」로 시작해야 해요' }
    if (def.category === 'ad' && route === 'email' && !hasUnsubscribePlaceholder(body)) return { ok: false, error: '광고 메일 본문에 {{unsubscribe_url}} 자리를 넣어 주세요' }
    const deeplink = typeof i.deeplink === 'string' && i.deeplink.trim() ? i.deeplink.trim() : null
    if (deeplink && !(/^curiai:\/\//.test(deeplink) || deeplink.startsWith('/'))) return { ok: false, error: '누르면 갈 곳은 curiai:// 또는 / 로 시작해야 해요' }
    const a = i.audience as { kind?: unknown; userIds?: unknown } | null
    let audience: CampaignAudience
    if (a?.kind === 'consented') {
        if (def.category !== 'ad') return { ok: false, error: '「동의한 사람 전체」는 광고 캠페인에만 써요. 공지는 회원 번호 목록으로' }
        audience = { kind: 'consented' }
    } else if (a?.kind === 'user_ids' && Array.isArray(a.userIds)) {
        const ids = [...new Set(a.userIds.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x.trim())).map(x => x.trim().toLowerCase()))]
        if (ids.length === 0 || ids.length > MAX_USER_IDS || ids.length !== a.userIds.length) return { ok: false, error: `회원 번호(uuid) 1~${MAX_USER_IDS}개, 틀린 번호·겹친 번호 없이` }
        audience = { kind: 'user_ids', userIds: ids }
    } else {
        return { ok: false, error: '대상을 골라 주세요' }
    }
    return { ok: true, value: { key, msgType: def.type, route, title, body, deeplink, audience } }
}

export type CampaignAction =
    | { action: 'edit' }
    | { action: 'test_sent' }
    | { action: 'approve'; by: string }
    | { action: 'schedule'; sendAt: Date; recipientCount: number }
    | { action: 'cancel' }

export type Decision = { ok: true; patch: Partial<Campaign> } | { ok: false; error: string }

/** 상태 바꾸기 판정. 순수 함수 = 시험이 쉽다. 승인권자 확인은 부르는 쪽(관리자 창구)이 한다 */
export function decide(c: Pick<Campaign, 'status' | 'approvedAt' | 'approvalExpiresAt'>, a: CampaignAction, now: Date, enabled = campaignsEnabled()): Decision {
    const s = c.status
    if (s === 'sent' || s === 'cancelled') return { ok: false, error: '이미 끝난 캠페인이에요' }
    switch (a.action) {
        case 'edit':
            if (s === 'scheduled' || s === 'sending') return { ok: false, error: '예약된 캠페인은 고칠 수 없어요. 취소하고 새로 만들어 주세요' }
            return { ok: true, patch: { status: 'draft', testedAt: null, approvedAt: null, approvedBy: null, approvalExpiresAt: null } }
        case 'test_sent':
            if (!enabled) return { ok: false, error: '캠페인 멈춤 스위치가 켜져 있어요(MSG_CAMPAIGNS_ENABLED)' }
            if (s !== 'draft' && s !== 'test_sent' && s !== 'approved') return { ok: false, error: '지금은 시험할 수 없어요' }
            return { ok: true, patch: { status: s === 'approved' ? 'approved' : 'test_sent', testedAt: now.toISOString() } }
        case 'approve':
            if (s !== 'test_sent' && s !== 'approved') return { ok: false, error: '대표 기기로 시험한 뒤에 승인할 수 있어요' }
            return { ok: true, patch: { status: 'approved', approvedAt: now.toISOString(), approvedBy: a.by, approvalExpiresAt: new Date(now.getTime() + APPROVAL_TTL_MS).toISOString() } }
        case 'schedule': {
            if (!enabled) return { ok: false, error: '캠페인 멈춤 스위치가 켜져 있어요(MSG_CAMPAIGNS_ENABLED)' }
            if (s !== 'test_sent' && s !== 'approved') return { ok: false, error: '대표 기기로 시험한 뒤에 예약할 수 있어요' }
            if (!Number.isFinite(a.sendAt.getTime()) || a.sendAt.getTime() < now.getTime() - 60_000) return { ok: false, error: '보낼 시각이 지났어요' }
            if (a.recipientCount <= 0) return { ok: false, error: '받을 사람이 없어요' }
            if (a.recipientCount > LOCK_THRESHOLD) {
                if (!approvalValid(c, now)) return { ok: false, error: `${LOCK_THRESHOLD}명이 넘어요. 대표 승인 버튼을 먼저 눌러 주세요(승인은 3시간 동안만 살아 있어요)` }
                if (a.sendAt.getTime() > new Date(c.approvalExpiresAt!).getTime()) return { ok: false, error: '보낼 시각이 승인 3시간 안이어야 해요' }
            }
            return { ok: true, patch: { status: 'scheduled', sendAt: a.sendAt.toISOString(), recipientCount: a.recipientCount } }
        }
        case 'cancel':
            return { ok: true, patch: { status: 'cancelled' } }
    }
}

export function approvalValid(c: Pick<Campaign, 'approvedAt' | 'approvalExpiresAt'>, now: Date): boolean {
    return !!c.approvedAt && !!c.approvalExpiresAt && now.getTime() < new Date(c.approvalExpiresAt).getTime()
}

/** 예약 작업이 이 캠페인을 지금 보내도 되나. terminal = 다시 볼 필요 없이 취소할 일 */
export function canRun(c: Pick<Campaign, 'status' | 'sendAt' | 'recipientCount' | 'approvedAt' | 'approvalExpiresAt'>, now: Date, enabled = campaignsEnabled()):
    { ok: true } | { ok: false; reason: 'campaigns_disabled' | 'not_due' | 'approval_expired'; terminal: boolean } {
    if (!enabled) return { ok: false, reason: 'campaigns_disabled', terminal: false }
    if (c.status !== 'scheduled' && c.status !== 'sending') return { ok: false, reason: 'not_due', terminal: false }
    if (!c.sendAt || new Date(c.sendAt).getTime() > now.getTime()) return { ok: false, reason: 'not_due', terminal: false }
    // 보내기 시작(scheduled → sending)은 승인 3시간 안에서만. 이미 보내는 중이면 이어서 끝낸다
    if (c.status === 'scheduled' && (c.recipientCount ?? Infinity) > LOCK_THRESHOLD && !approvalValid(c, now)) {
        return { ok: false, reason: 'approval_expired', terminal: true }
    }
    return { ok: true }
}

// ───────── 보내기 (예약 작업 · 관리자 「지금 보내기」 공용) ─────────

export interface Recipient { userId: string; email: string | null }
export type SendStatus = 'sent' | 'blocked' | 'failed'

export interface CampaignRunStore {
    listDue(now: Date): Promise<Campaign[]>
    /** status 가 from 중 하나일 때만 sending 으로 바꾼다. 바꿨으면 true (두 곳이 동시에 잡지 못하게) */
    claim(id: string, from: CampaignStatus[]): Promise<boolean>
    /** 커서 뒤로 받을 사람 한 쪽(회원 번호 순) */
    nextRecipients(c: Campaign, after: string | null, limit: number): Promise<Recipient[]>
    /** (캠페인, 사람) 줄을 먼저 적는다. 이미 있으면 false = 보내지 않는다 */
    reserve(campaignId: string, userId: string): Promise<boolean>
    record(campaignId: string, userId: string, status: SendStatus, reason: string | null): Promise<void>
    update(id: string, patch: Partial<Campaign> & { sentAt?: string; lastError?: string | null; stats?: Record<string, number> }): Promise<void>
}

export interface RunResult { campaigns: number; sent: number; blocked: number; failed: number; skipped: number; notes: string[] }

export async function runDueCampaigns(a: {
    store: CampaignRunStore
    send: (c: Campaign, r: Recipient) => Promise<{ status: SendStatus; reason?: string | null }>
    now?: () => Date
    enabled?: boolean
    /** 이 시각(ms)이 지나면 다음 회차로 넘긴다 */
    deadline?: number
    pageSize?: number
    onlyId?: string
}): Promise<RunResult> {
    const now = a.now ?? (() => new Date())
    const enabled = a.enabled ?? campaignsEnabled()
    const out: RunResult = { campaigns: 0, sent: 0, blocked: 0, failed: 0, skipped: 0, notes: [] }
    if (!enabled) { out.notes.push('멈춤 스위치(MSG_CAMPAIGNS_ENABLED)'); return out }
    const due = (await a.store.listDue(now())).filter(c => !a.onlyId || c.id === a.onlyId)
    for (const c of due) {
        const ok = canRun(c, now(), enabled)
        if (!ok.ok) {
            if (ok.terminal) {
                await a.store.update(c.id, { status: 'cancelled', lastError: ok.reason })
                out.notes.push(`${c.key}: ${ok.reason} → 취소`)
            }
            continue
        }
        if (!(await a.store.claim(c.id, ['scheduled', 'sending']))) continue
        out.campaigns++
        const approved = !!c.approvedAt
        let cursor = c.cursor
        let processed = 0
        let finished = false
        const stats = { sent: 0, blocked: 0, failed: 0, skipped: 0 }
        for (;;) {
            if (a.deadline && Date.now() > a.deadline) break
            const page = await a.store.nextRecipients(c, cursor, a.pageSize ?? 200)
            if (page.length === 0) { finished = true; break }
            for (const r of page) {
                cursor = r.userId
                // 승인 없이 시작한 작은 캠페인이 보내는 동안 30명을 넘으면 멈춘다
                if (!approved && processed >= LOCK_THRESHOLD) {
                    await a.store.update(c.id, { status: 'cancelled', cursor, lastError: 'over_30_without_approval', stats })
                    out.notes.push(`${c.key}: 승인 없이 ${LOCK_THRESHOLD}명을 넘어 멈춤`)
                    return addStats(out, stats)
                }
                if (!(await a.store.reserve(c.id, r.userId))) { stats.skipped++; continue }
                processed++
                let res: { status: SendStatus; reason?: string | null }
                try { res = await a.send(c, r) } catch (e) { res = { status: 'failed', reason: e instanceof Error ? e.message.slice(0, 200) : 'error' } }
                stats[res.status]++
                await a.store.record(c.id, r.userId, res.status, res.reason ?? null)
            }
            await a.store.update(c.id, { cursor })
        }
        await a.store.update(c.id, finished
            ? { status: 'sent', cursor, sentAt: now().toISOString(), stats, lastError: null }
            : { status: 'sending', cursor, stats })
        addStats(out, stats)
    }
    return out
}

function addStats(out: RunResult, s: { sent: number; blocked: number; failed: number; skipped: number }): RunResult {
    out.sent += s.sent; out.blocked += s.blocked; out.failed += s.failed; out.skipped += s.skipped
    return out
}
