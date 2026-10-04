import { describe, it, expect, vi } from 'vitest'
import { APPROVAL_TTL_MS, campaignsEnabled, canRun, decide, isApprover, runDueCampaigns, validateDraft } from '../campaign'
import type { Campaign, CampaignRunStore, Recipient } from '../campaign'

const CK = ['261004', 'newbot'].join('_')
const NOW = new Date('2026-10-04T02:00:00Z') // 서울 11시
const later = (min: number) => new Date(NOW.getTime() + min * 60_000)
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const draft = {
    key: CK, msgType: 'CAMPAIGN_AD_PUSH', route: 'app_push', title: '(광고) 새 봇이 왔어요', body: '만나 보세요',
    audience: { kind: 'consented' },
}

describe('캠페인 초안 검사', () => {
    it('맞는 초안은 통과', () => {
        expect(validateDraft(draft).ok).toBe(true)
    })
    it('캠페인 열쇠는 YYMMDD_짧은이름 (있는 날짜)', () => {
        for (const key of ['newbot', '261304_x', '261004-x', '261004_New', '261004_', '261031_ok'.replace('31', '32')]) {
            expect(validateDraft({ ...draft, key }).ok, key).toBe(false)
        }
    })
    it('캠페인 유형만 된다(P001 같은 자동 알림 유형은 안 됨)', () => {
        expect(validateDraft({ ...draft, msgType: 'P001' }).ok).toBe(false)
    })
    it('광고는 제목 「(광고)」, 광고 메일은 수신 거부 자리 필수', () => {
        expect(validateDraft({ ...draft, title: '새 봇' }).ok).toBe(false)
        expect(validateDraft({ ...draft, msgType: 'CAMPAIGN_AD_EMAIL', route: 'email', body: '안녕' }).ok).toBe(false)
        expect(validateDraft({ ...draft, msgType: 'CAMPAIGN_AD_EMAIL', route: 'email', body: '안녕 {{unsubscribe_url}}' }).ok).toBe(true)
    })
    it('문자 캠페인은 없다', () => {
        expect(validateDraft({ ...draft, route: 'sms' }).ok).toBe(false)
    })
    it('공지(정보) 캠페인은 회원 번호 목록으로만', () => {
        const info = { ...draft, msgType: 'CAMPAIGN_INFO', title: '공지' }
        expect(validateDraft(info).ok).toBe(false)
        expect(validateDraft({ ...info, audience: { kind: 'user_ids', userIds: [uid(1), uid(2)] } }).ok).toBe(true)
        expect(validateDraft({ ...info, audience: { kind: 'user_ids', userIds: [uid(1), 'x'] } }).ok).toBe(false)
    })
})

describe('캠페인 상태 바꾸기', () => {
    const c = (status: Campaign['status'], approvedAt: string | null = null, approvalExpiresAt: string | null = null) => ({ status, approvedAt, approvalExpiresAt })

    it('초안 → 시험 → 승인 → 예약 순서', () => {
        expect(decide(c('draft'), { action: 'test_sent' }, NOW, true)).toMatchObject({ ok: true, patch: { status: 'test_sent' } })
        const ap = decide(c('test_sent'), { action: 'approve', by: 'u' }, NOW, true)
        expect(ap).toMatchObject({ ok: true, patch: { status: 'approved' } })
        if (!ap.ok) throw new Error()
        expect(new Date(ap.patch.approvalExpiresAt!).getTime() - NOW.getTime()).toBe(APPROVAL_TTL_MS)
        expect(decide(c('approved', NOW.toISOString(), later(180).toISOString()), { action: 'schedule', sendAt: later(30), recipientCount: 500 }, NOW, true))
            .toMatchObject({ ok: true, patch: { status: 'scheduled', recipientCount: 500 } })
    })
    it('시험 없이 승인·예약 못 한다', () => {
        expect(decide(c('draft'), { action: 'approve', by: 'u' }, NOW, true).ok).toBe(false)
        expect(decide(c('draft'), { action: 'schedule', sendAt: later(5), recipientCount: 3 }, NOW, true).ok).toBe(false)
    })
    it('승인 없이 31명 캠페인 → 예약 못 함. 30명은 시험만으로 예약된다', () => {
        expect(decide(c('test_sent'), { action: 'schedule', sendAt: later(5), recipientCount: 31 }, NOW, true).ok).toBe(false)
        expect(decide(c('test_sent'), { action: 'schedule', sendAt: later(5), recipientCount: 30 }, NOW, true).ok).toBe(true)
    })
    it('승인은 3시간 뒤 꺼진다. 예약 시각도 3시간 안이어야 한다', () => {
        const ap = c('approved', NOW.toISOString(), later(180).toISOString())
        expect(decide(ap, { action: 'schedule', sendAt: later(200), recipientCount: 31 }, later(181), true).ok).toBe(false)
        expect(decide(ap, { action: 'schedule', sendAt: later(200), recipientCount: 31 }, NOW, true).ok).toBe(false)
    })
    it('예약된 캠페인은 고칠 수 없고, 고치면 시험·승인이 지워진다', () => {
        expect(decide(c('scheduled'), { action: 'edit' }, NOW, true).ok).toBe(false)
        expect(decide(c('approved', NOW.toISOString(), later(180).toISOString()), { action: 'edit' }, NOW, true))
            .toMatchObject({ ok: true, patch: { status: 'draft', approvedAt: null, testedAt: null } })
    })
    it('보냄·취소된 캠페인은 아무것도 못 한다', () => {
        for (const s of ['sent', 'cancelled'] as const) for (const a of [{ action: 'test_sent' as const }, { action: 'cancel' as const }]) expect(decide(c(s), a, NOW, true).ok).toBe(false)
    })
    it('멈춤 스위치가 켜지면 시험·예약이 안 된다', () => {
        expect(decide(c('draft'), { action: 'test_sent' }, NOW, false).ok).toBe(false)
        expect(decide(c('test_sent'), { action: 'schedule', sendAt: later(5), recipientCount: 3 }, NOW, false).ok).toBe(false)
    })
    it('멈춤 스위치 값: 없으면 켬, 0·false·off 면 멈춤', () => {
        expect(campaignsEnabled(undefined)).toBe(true)
        for (const v of ['0', 'false', 'OFF']) expect(campaignsEnabled(v)).toBe(false)
    })
    it('승인권자는 기본 대표 한 사람', () => {
        expect(isApprover('JIN@mission-driven.kr', ['jin@mission-driven.kr'])).toBe(true)
        expect(isApprover('other@x.com', ['jin@mission-driven.kr'])).toBe(false)
    })
    it('보내기 시작은 승인 3시간 안에서만(31명 이상)', () => {
        const base = { status: 'scheduled' as const, sendAt: NOW.toISOString(), recipientCount: 31, approvedAt: NOW.toISOString(), approvalExpiresAt: later(180).toISOString() }
        expect(canRun(base, later(10), true)).toEqual({ ok: true })
        expect(canRun(base, later(181), true)).toMatchObject({ ok: false, reason: 'approval_expired', terminal: true })
        expect(canRun({ ...base, sendAt: later(30).toISOString() }, later(10), true)).toMatchObject({ ok: false, reason: 'not_due' })
    })
})

function fakeRunStore(campaigns: Campaign[], audience: Recipient[]) {
    const reserved = new Set<string>()
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
    const store: CampaignRunStore = {
        listDue: async () => campaigns.filter(c => c.status === 'scheduled' || c.status === 'sending'),
        claim: async (id, from) => {
            const c = campaigns.find(x => x.id === id)!
            if (!from.includes(c.status)) return false
            c.status = 'sending'
            return true
        },
        nextRecipients: async (_c, after, limit) => audience.filter(r => !after || r.userId > after).slice(0, limit),
        reserve: async (cid, u) => { const k = `${cid}:${u}`; if (reserved.has(k)) return false; reserved.add(k); return true },
        record: async () => {},
        update: async (id, patch) => { updates.push({ id, patch }); Object.assign(campaigns.find(x => x.id === id)!, patch) },
    }
    return { store, updates, reserved }
}

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
    id: 'c1', key: CK, msgType: 'CAMPAIGN_AD_PUSH', route: 'app_push', title: '(광고) x', body: 'y', deeplink: null,
    audience: { kind: 'consented' }, status: 'scheduled', recipientCount: 3, sendAt: NOW.toISOString(), testedAt: NOW.toISOString(),
    approvedAt: null, approvedBy: null, approvalExpiresAt: null, cursor: null, ...over,
})

describe('캠페인 보내기(예약 작업)', () => {
    const people = [1, 2, 3].map(n => ({ userId: uid(n), email: null }))

    it('시각이 된 캠페인을 한 번 보내고 「보냄」으로 바꾼다', async () => {
        const cs = [campaign()]
        const { store } = fakeRunStore(cs, people)
        const send = vi.fn(async () => ({ status: 'sent' as const }))
        const r = await runDueCampaigns({ store, send, now: () => later(1), enabled: true })
        expect(r).toMatchObject({ campaigns: 1, sent: 3 })
        expect(cs[0].status).toBe('sent')
    })
    it('보냄 상태 캠페인을 다시 돌리면 0통', async () => {
        const cs = [campaign()]
        const { store } = fakeRunStore(cs, people)
        const send = vi.fn(async () => ({ status: 'sent' as const }))
        await runDueCampaigns({ store, send, now: () => later(1), enabled: true })
        const again = await runDueCampaigns({ store, send, now: () => later(2), enabled: true })
        expect(again.sent).toBe(0)
        expect(send).toHaveBeenCalledTimes(3)
    })
    it('같은 캠페인 + 같은 사람은 두 번 안 간다(다른 곳에서 먼저 잡았어도)', async () => {
        const cs = [campaign()]
        const { store, reserved } = fakeRunStore(cs, people)
        reserved.add(`c1:${uid(2)}`)
        const send = vi.fn(async () => ({ status: 'sent' as const }))
        const r = await runDueCampaigns({ store, send, now: () => later(1), enabled: true })
        expect(r).toMatchObject({ sent: 2, skipped: 1 })
    })
    it('승인 없이 31명째가 되면 멈추고 취소한다', async () => {
        const many = Array.from({ length: 40 }, (_, i) => ({ userId: uid(i + 1), email: null }))
        const cs = [campaign({ recipientCount: 30 })]
        const { store } = fakeRunStore(cs, many)
        const send = vi.fn(async () => ({ status: 'sent' as const }))
        const r = await runDueCampaigns({ store, send, now: () => later(1), enabled: true })
        expect(send).toHaveBeenCalledTimes(30)
        expect(r.sent).toBe(30)
        expect(cs[0].status).toBe('cancelled')
    })
    it('승인이 꺼진 31명 이상 캠페인은 시작하지 않고 취소한다', async () => {
        const cs = [campaign({ recipientCount: 500, approvedAt: NOW.toISOString(), approvalExpiresAt: later(180).toISOString() })]
        const { store } = fakeRunStore(cs, people)
        const send = vi.fn()
        await runDueCampaigns({ store, send, now: () => later(200), enabled: true })
        expect(send).not.toHaveBeenCalled()
        expect(cs[0].status).toBe('cancelled')
    })
    it('멈춤 스위치가 켜지면 아무것도 안 보낸다(예약은 그대로 남는다)', async () => {
        const cs = [campaign()]
        const { store } = fakeRunStore(cs, people)
        const send = vi.fn()
        await runDueCampaigns({ store, send, now: () => later(1), enabled: false })
        expect(send).not.toHaveBeenCalled()
        expect(cs[0].status).toBe('scheduled')
    })
    it('아직 시각이 안 된 캠페인은 안 보낸다', async () => {
        const cs = [campaign({ sendAt: later(60).toISOString() })]
        const { store } = fakeRunStore(cs, people)
        const send = vi.fn()
        await runDueCampaigns({ store, send, now: () => later(1), enabled: true })
        expect(send).not.toHaveBeenCalled()
    })
    it('막힌 사람은 막힘으로 센다(관문 규칙)', async () => {
        const cs = [campaign()]
        const { store } = fakeRunStore(cs, people)
        const send = vi.fn(async (_c: Campaign, r: Recipient) => (r.userId === uid(1) ? { status: 'blocked' as const, reason: 'ad_no_consent' } : { status: 'sent' as const }))
        expect(await runDueCampaigns({ store, send, now: () => later(1), enabled: true })).toMatchObject({ sent: 2, blocked: 1 })
    })
})
