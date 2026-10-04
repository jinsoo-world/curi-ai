import { describe, it, expect, vi } from 'vitest'
import { dispatch } from '../dispatch'
import type { AdProfile, Channel, Driver, MessagingStore, MessageLogEntry, NotificationPrefs, OutboundMessage } from '../types'
import { DEFAULT_PREFS } from '../types'
import type { SuppressionRow } from '../consent'
import { kstDayStart } from '../rules'
import { hashAddress } from '../consent'

// 서울 시각 (UTC+9). 14:00 = 낮, 23:30 = 조용한 시간
const CK3 = ['261003', 'newbot'].join('_')
const kst = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 23, h - 9, m))
const DAY = () => kst(14)
const NIGHT = () => kst(23, 30)

function fakeDriver(opts: { ready?: boolean; ok?: boolean } = {}): Driver & { send: ReturnType<typeof vi.fn> } {
    const ready = opts.ready ?? true
    const ok = opts.ok ?? true
    return {
        ready: () => ready,
        send: vi.fn(async () => ok ? { ok: true as const, id: 'msg-1' } : { ok: false as const, error: '서버가 거절했어요' }),
    }
}

function fakeStore(opts: {
    approved?: string[]
    prefs?: Partial<NotificationPrefs>
    switches?: Record<string, boolean>
    consent?: Partial<AdProfile['consent']>
    consentAt?: string | null
    account?: { email?: string; phone?: string }
    suppressions?: Array<SuppressionRow & { hash: string }>
    sentToday?: number
    adToday?: number
    adWeek?: number
    sentKeys?: string[]
    fail?: 'type' | 'consent' | 'suppression' | 'cap'
} = {}) {
    const logs: MessageLogEntry[] = []
    const store: MessagingStore = {
        async getApprovedRequest(id, userId) {
            return (opts.approved ?? []).includes(id) ? { id, userId } : null
        },
        async getPrefs() { return { ...DEFAULT_PREFS, ...(opts.prefs ?? {}) } },
        async log(entry) { logs.push(entry) },
        async getTypeSwitch(type) {
            if (opts.fail === 'type') throw new Error('db down')
            return opts.switches && type in opts.switches ? opts.switches[type] : null
        },
        async getAdProfile() {
            if (opts.fail === 'consent') throw new Error('db down')
            return {
                consent: { app_push: false, web_push: false, email: false, sms: false, ...(opts.consent ?? {}) },
                consentAt: opts.consentAt ?? null,
                email: opts.account?.email ?? null,
                phone: opts.account?.phone ?? null,
            }
        },
        async findSuppressions(hashes, channels) {
            if (opts.fail === 'suppression') throw new Error('db down')
            return (opts.suppressions ?? []).filter(r => hashes.includes(r.hash) && channels.includes(r.channel))
        },
        async countSent(_u, since, category) {
            if (opts.fail === 'cap') throw new Error('db down')
            const weekly = since.getTime() < kstDayStart(DAY()).getTime()
            if (category === 'ad') return weekly ? (opts.adWeek ?? 0) : (opts.adToday ?? 0)
            return opts.sentToday ?? 0
        },
        async hasSent(_u, type, key) { return (opts.sentKeys ?? []).includes(`${type}:${key}`) },
    }
    return { store, logs }
}

function drivers(over: Partial<Record<Channel, Driver>> = {}): Record<Channel, Driver> {
    return { push: fakeDriver(), sms: fakeDriver(), email: fakeDriver(), ...over }
}

const msg = (channel: Channel, extra: Partial<OutboundMessage> = {}): OutboundMessage => ({
    channel, userId: 'u1', body: '루틴이 끝났어요', subject: '큐리AI', to: channel === 'sms' ? '01012345678' : channel === 'email' ? 'jin@mission-driven.kr' : undefined, ...extra,
})

describe('messaging/dispatch — 모든 발신은 관문 한 곳을 지난다', () => {
    it('내게 오는 알림(루틴 결과)은 통과해 보내진다', async () => {
        const { store, logs } = fakeStore()
        const d = drivers()
        const r = await dispatch({ message: msg('push'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('sent')
        expect(d.push.send).toHaveBeenCalledTimes(1)
        expect(logs).toHaveLength(1)
        expect(logs[0].status).toBe('sent')
        expect(logs[0].channel).toBe('push')
    })

    it('봇이 남에게 보내는데 승인 카드가 없으면 blocked — 드라이버를 부르지도 않는다', async () => {
        const { store, logs } = fakeStore()
        const d = drivers()
        const r = await dispatch({ message: msg('email'), audience: 'other', type: 'BOT_OUTBOUND' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('blocked')
        expect(r.reason).toBe('no_permission')
        expect(d.email.send).not.toHaveBeenCalled()
        expect(logs[0].status).toBe('blocked')
    })

    it('승인 카드 id 가 있어도 allowed 상태가 아니면(없는 카드·남의 카드·pending) blocked', async () => {
        const { store } = fakeStore({ approved: ['ok-1'] })
        const d = drivers()
        const r = await dispatch({ message: msg('email'), audience: 'other', type: 'BOT_OUTBOUND', permissionRequestId: 'pending-9' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('blocked')
        expect(r.reason).toBe('no_permission')
        expect(d.email.send).not.toHaveBeenCalled()
    })

    it('allowed 카드가 있으면 남에게도 나간다. 로그에 카드 id 가 남는다', async () => {
        const { store, logs } = fakeStore({ approved: ['ok-1'] })
        const d = drivers()
        const r = await dispatch({ message: msg('email'), audience: 'other', type: 'BOT_OUTBOUND', permissionRequestId: 'ok-1' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('sent')
        expect(d.email.send).toHaveBeenCalledTimes(1)
        expect(logs[0].permissionRequestId).toBe('ok-1')
    })

    it('초안만 만드는 봇(draft_only)은 카드가 있어도 밖으로 못 보낸다', async () => {
        const { store } = fakeStore({ approved: ['ok-1'] })
        const d = drivers()
        const r = await dispatch({ message: msg('email'), audience: 'other', type: 'BOT_OUTBOUND', permissionRequestId: 'ok-1', approvalMode: 'draft_only' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('blocked')
        expect(r.reason).toBe('draft_only')
        expect(d.email.send).not.toHaveBeenCalled()
    })

    it('SMS_ENABLED 가 없으면 문자는 기록만 하고 blocked (돈 드는 채널)', async () => {
        const { store, logs } = fakeStore({ prefs: { sms: true } })
        const d = drivers()
        const r = await dispatch({ message: msg('sms'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: DAY, smsEnabled: false })
        expect(r.status).toBe('blocked')
        expect(r.reason).toBe('sms_disabled')
        expect(d.sms.send).not.toHaveBeenCalled()
        expect(logs[0].status).toBe('blocked')
    })

    it('SMS_ENABLED=true 이고 문자를 켜 두었으면 나간다', async () => {
        const { store } = fakeStore({ prefs: { sms: true } })
        const d = drivers()
        const r = await dispatch({ message: msg('sms'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: DAY, smsEnabled: true })
        expect(r.status).toBe('sent')
        expect(d.sms.send).toHaveBeenCalledTimes(1)
    })

    it('조용한 시간(23:30)엔 푸시·문자는 보류(blocked/quiet_hours), 이메일은 나간다', async () => {
        const { store } = fakeStore({ prefs: { sms: true } })
        const d = drivers()
        const push = await dispatch({ message: msg('push'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: NIGHT })
        const sms = await dispatch({ message: msg('sms'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: NIGHT, smsEnabled: true })
        const email = await dispatch({ message: msg('email'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: NIGHT })
        expect(push).toMatchObject({ status: 'blocked', reason: 'quiet_hours' })
        expect(sms).toMatchObject({ status: 'blocked', reason: 'quiet_hours' })
        expect(email.status).toBe('sent')
        expect(d.push.send).not.toHaveBeenCalled()
        expect(d.sms.send).not.toHaveBeenCalled()
    })

    it('사용자가 정한 조용한 시간을 따른다', async () => {
        const { store } = fakeStore({ prefs: { quietFrom: '13:00', quietTo: '15:00' } })
        const d = drivers()
        const r = await dispatch({ message: msg('push'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: DAY })
        expect(r).toMatchObject({ status: 'blocked', reason: 'quiet_hours' })
    })

    it('내가 그 채널을 꺼 두었으면(푸시 off) 내게 오는 알림은 blocked', async () => {
        const { store } = fakeStore({ prefs: { push: false } })
        const d = drivers()
        const r = await dispatch({ message: msg('push'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: DAY })
        expect(r).toMatchObject({ status: 'blocked', reason: 'channel_off' })
        expect(d.push.send).not.toHaveBeenCalled()
    })

    it('문자는 기본이 꺼져 있다(기본값 sms=false)', async () => {
        const { store } = fakeStore()
        const d = drivers()
        const r = await dispatch({ message: msg('sms'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: DAY, smsEnabled: true })
        expect(r).toMatchObject({ status: 'blocked', reason: 'channel_off' })
    })

    it('열쇠가 없어 드라이버가 준비 안 됐으면 blocked (죽지 않는다)', async () => {
        const { store, logs } = fakeStore()
        const d = drivers({ email: fakeDriver({ ready: false }) })
        const r = await dispatch({ message: msg('email'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: DAY })
        expect(r).toMatchObject({ status: 'blocked', reason: 'driver_not_ready' })
        expect(logs[0].status).toBe('blocked')
    })

    it('드라이버가 실패하면 failed 로 기록한다', async () => {
        const { store, logs } = fakeStore()
        const d = drivers({ push: fakeDriver({ ok: false }) })
        const r = await dispatch({ message: msg('push'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('failed')
        expect(logs[0].status).toBe('failed')
        expect(logs[0].error).toBe('서버가 거절했어요')
    })

    it('로그에는 받는 곳 끝 4자만 남는다(전화번호 전체 금지)', async () => {
        const { store, logs } = fakeStore({ prefs: { sms: true } })
        await dispatch({ message: msg('sms'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: drivers(), now: DAY, smsEnabled: true })
        expect(logs[0].toHint).toBe('5678')
        expect(JSON.stringify(logs[0])).not.toContain('01012345678')
    })

    it('기록 저장이 실패해도(표 없음) 결과는 돌려준다', async () => {
        const { store } = fakeStore()
        store.log = async () => { throw new Error('relation "message_log" does not exist') }
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const r = await dispatch({ message: msg('push'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: drivers(), now: DAY })
        expect(r.status).toBe('sent')
        warn.mockRestore()
    })

    it('남에게 보낸 메일이 나갔는데 기록이 실패하면 console.error (하루 상한을 못 세게 되니 크게 알린다)', async () => {
        const { store } = fakeStore({ approved: ['ok-1'] })
        store.log = async () => { throw new Error('insert failed') }
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const r = await dispatch({ message: msg('email'), audience: 'other', type: 'BOT_OUTBOUND', permissionRequestId: 'ok-1' }, { store, drivers: drivers(), now: DAY })
        expect(r.status).toBe('sent')
        expect(err).toHaveBeenCalledTimes(1)
        expect(warn).not.toHaveBeenCalled()
        err.mockRestore(); warn.mockRestore()
    })

    it('막힌 기록이 실패하면 지금처럼 경고만', async () => {
        const { store } = fakeStore()
        store.log = async () => { throw new Error('insert failed') }
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        await dispatch({ message: msg('email'), audience: 'other', type: 'BOT_OUTBOUND' }, { store, drivers: drivers(), now: DAY })
        expect(err).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalledTimes(1)
        err.mockRestore(); warn.mockRestore()
    })
})

describe('dispatch — 앱 푸시(아이폰·안드로이드)는 같은 관문을 지나 sendPush 로 간다', () => {
    const appInput = {
        message: { channel: 'push' as const, userId: 'u1', subject: '기획팀장이 루틴을 마쳤어요', body: '결과가 왔어요', url: 'curiai://bot/m1' },
        audience: 'self' as const,
        type: 'P001',
        dedupe: { key: 'day:2026-09-23' },
        appPush: { deeplink: 'curiai://bot/m1' },
    }

    it('앱 푸시 드라이버로 보내고 웹푸시는 부르지 않는다. message_log 에도 한 줄', async () => {
        const { store, logs } = fakeStore()
        const web = fakeDriver()
        const appPush = vi.fn(async () => ({ status: 'sent' as const, batchId: 'b1', delivered: 1, failed: 0, disabled: 0, sendIds: ['s1'] }))
        const out = await dispatch(appInput, { store, drivers: { push: web, sms: fakeDriver(), email: fakeDriver() }, now: DAY, appPush })
        expect(out).toMatchObject({ status: 'sent', id: 'apppush:b1' })
        expect(web.send).not.toHaveBeenCalled()
        expect(appPush).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', type: 'P001', category: 'info', title: '기획팀장이 루틴을 마쳤어요', deeplink: 'curiai://bot/m1', dedupe: { key: 'day:2026-09-23' } }))
        expect(logs).toEqual([expect.objectContaining({ channel: 'push', status: 'sent', subject: '[P001] 기획팀장이 루틴을 마쳤어요' })])
    })

    it('앱 푸시 규칙에 걸리면 막고 이유를 남긴다. 웹푸시로 다시 보내지 않는다', async () => {
        const { store, logs } = fakeStore()
        const web = fakeDriver()
        const appPush = vi.fn(async () => ({ status: 'blocked' as const, reason: 'daily_cap' as const }))
        const out = await dispatch(appInput, { store, drivers: { push: web, sms: fakeDriver(), email: fakeDriver() }, now: DAY, appPush })
        expect(out).toMatchObject({ status: 'blocked', reason: 'push_rule', pushReason: 'daily_cap' })
        expect(web.send).not.toHaveBeenCalled()
        expect(logs[0]).toMatchObject({ status: 'blocked', error: 'daily_cap' })
    })

    it('조용한 시간 판정도 앱 푸시 드라이버가 한다(관리자 시험은 건너뛸 수 있게)', async () => {
        const { store } = fakeStore()
        const appPush = vi.fn(async () => ({ status: 'sent' as const, batchId: 'b', delivered: 1, failed: 0, disabled: 0, sendIds: [] }))
        const out = await dispatch({ ...appInput, test: true }, { store, drivers: { push: fakeDriver(), sms: fakeDriver(), email: fakeDriver() }, now: NIGHT, appPush })
        expect(out.status).toBe('sent')
        expect(appPush).toHaveBeenCalledWith(expect.objectContaining({ ignoreLimits: true }))
    })

    it('앱이 없는 사람(no_device)은 기록하지 않고 조용히 끝난다', async () => {
        const { store, logs } = fakeStore()
        const out = await dispatch(appInput, { store, drivers: { push: fakeDriver(), sms: fakeDriver(), email: fakeDriver() }, now: DAY, appPush: async () => ({ status: 'blocked' as const, reason: 'no_device' as const }) })
        expect(out).toMatchObject({ status: 'blocked', pushReason: 'no_device' })
        expect(logs).toHaveLength(0)
    })

    it('앱 푸시 열쇠가 없으면 driver_not_ready', async () => {
        const { store } = fakeStore()
        const out = await dispatch(appInput, { store, drivers: { push: fakeDriver(), sms: fakeDriver(), email: fakeDriver() }, now: DAY, appPush: async () => ({ skipped: 'not_configured' as const }) })
        expect(out).toMatchObject({ status: 'blocked', reason: 'driver_not_ready' })
    })

    it('남에게 보내는 메시지는 앱 푸시 길을 타지 않는다(승인 카드 규칙 그대로)', async () => {
        const { store } = fakeStore()
        const appPush = vi.fn()
        const out = await dispatch({ ...appInput, audience: 'other', permissionRequestId: null }, { store, drivers: { push: fakeDriver(), sms: fakeDriver(), email: fakeDriver() }, now: DAY, appPush })
        expect(out).toMatchObject({ status: 'blocked', reason: 'no_permission' })
        expect(appPush).not.toHaveBeenCalled()
    })
})

describe('메시지엔진 1차 — 모든 채널이 같은 규칙을 지난다', () => {
    const h = hashAddress
    const AFTERNOON = () => kst(14)
    const at21 = () => kst(21, 0)
    const adPush = { message: { channel: 'push' as const, userId: 'u1', subject: '(광고) 새 봇이 왔어요', body: '만나 보세요' }, audience: 'self' as const, type: 'CAMPAIGN_AD_PUSH', campaignKey: CK3 }
    const adMail = (body = '안녕하세요\n수신 거부: {{unsubscribe_url}}') => ({
        message: { channel: 'email' as const, userId: 'u1', to: 'fan@example.com', subject: '(광고) 10월 소식', body },
        audience: 'self' as const, type: 'CAMPAIGN_AD_EMAIL', campaignKey: CK3,
    })
    const on = { CAMPAIGN_AD_PUSH: true, CAMPAIGN_AD_EMAIL: true, CAMPAIGN_INFO: true }
    const unsub = () => 'https://www.curi-ai.com/api/unsubscribe?t=abc'

    it('장부에 없는 유형은 막힌다(unknown_type) — 드라이버를 부르지 않는다', async () => {
        const { store, logs } = fakeStore()
        const d = drivers()
        const r = await dispatch({ message: msg('push'), audience: 'self', type: 'P999' }, { store, drivers: d, now: DAY })
        expect(r).toMatchObject({ status: 'blocked', reason: 'unknown_type' })
        expect(d.push.send).not.toHaveBeenCalled()
        expect(logs[0]).toMatchObject({ status: 'blocked', error: 'unknown_type', msgType: 'P999' })
    })

    it('처음엔 꺼진 유형(P002)은 막히고, 관리자가 켜면 나간다', async () => {
        const off = fakeStore()
        const appPush = vi.fn(async () => ({ status: 'sent' as const, batchId: 'b', delivered: 1, failed: 0, disabled: 0, sendIds: [] }))
        const input = { message: { channel: 'push' as const, userId: 'u1', subject: '루틴을 못 했어요', body: '...' }, audience: 'self' as const, type: 'P002', appPush: { deeplink: null } }
        expect(await dispatch(input, { store: off.store, drivers: drivers(), now: DAY, appPush })).toMatchObject({ status: 'blocked', reason: 'type_off' })
        expect(appPush).not.toHaveBeenCalled()
        const onStore = fakeStore({ switches: { P002: true } })
        expect((await dispatch(input, { store: onStore.store, drivers: drivers(), now: DAY, appPush })).status).toBe('sent')
    })

    it('켜져 있던 유형(P001)도 관리자가 끄면 막힌다', async () => {
        const { store } = fakeStore({ switches: { P001: false } })
        const appPush = vi.fn()
        const r = await dispatch({ message: { channel: 'push', userId: 'u1', subject: 'x', body: 'y' }, audience: 'self', type: 'P001', appPush: { deeplink: null } }, { store, drivers: drivers(), now: DAY, appPush })
        expect(r).toMatchObject({ status: 'blocked', reason: 'type_off' })
        expect(appPush).not.toHaveBeenCalled()
    })

    it('장부 표를 못 읽으면 보내지 않는다(check_failed)', async () => {
        const { store } = fakeStore({ fail: 'type' })
        const r = await dispatch({ message: msg('push'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: drivers(), now: DAY })
        expect(r).toMatchObject({ status: 'blocked', reason: 'check_failed' })
    })

    it('유형이 쓰지 않는 채널은 막힌다(P001 은 앱 푸시만 → 메일 금지)', async () => {
        const { store } = fakeStore()
        const r = await dispatch({ message: msg('email'), audience: 'self', type: 'P001' }, { store, drivers: drivers(), now: DAY })
        expect(r).toMatchObject({ status: 'blocked', reason: 'route_not_allowed' })
    })

    it('캠페인 유형은 캠페인 열쇠 없이 못 보낸다', async () => {
        const { store } = fakeStore({ switches: on, consent: { web_push: true } })
        const r = await dispatch({ ...adPush, campaignKey: undefined }, { store, drivers: drivers(), now: AFTERNOON })
        expect(r).toMatchObject({ status: 'blocked', reason: 'route_not_allowed' })
    })

    it('광고 메일 21시 시도 → 막힘 (설계서 1차 1번 합격 기준)', async () => {
        const { store } = fakeStore({ switches: on, consent: { email: true } })
        const d = drivers()
        const r = await dispatch(adMail(), { store, drivers: d, now: at21, unsubscribeUrl: unsub })
        expect(r).toMatchObject({ status: 'blocked', reason: 'ad_quiet_hours' })
        expect(d.email.send).not.toHaveBeenCalled()
    })

    it('광고 웹 푸시도 21~08시엔 막힌다(앱 푸시와 같은 규칙)', async () => {
        const { store } = fakeStore({ switches: on, consent: { web_push: true } })
        expect(await dispatch(adPush, { store, drivers: drivers(), now: () => kst(7, 59) })).toMatchObject({ reason: 'ad_quiet_hours' })
    })

    it('광고는 제목이 「(광고)」로 시작해야 한다 (메일·푸시)', async () => {
        const { store } = fakeStore({ switches: on, consent: { email: true, web_push: true } })
        const m = adMail(); m.message.subject = '10월 소식'
        expect(await dispatch(m, { store, drivers: drivers(), now: AFTERNOON, unsubscribeUrl: unsub })).toMatchObject({ reason: 'ad_title_prefix' })
        expect(await dispatch({ ...adPush, message: { ...adPush.message, subject: '새 봇' } }, { store, drivers: drivers(), now: AFTERNOON })).toMatchObject({ reason: 'ad_title_prefix' })
    })

    it('광고는 그 채널의 동의 칸으로만 판단한다 (앱 동의만 있으면 메일 광고는 막힘)', async () => {
        const { store } = fakeStore({ switches: on, consent: { app_push: true } })
        expect(await dispatch(adMail(), { store, drivers: drivers(), now: AFTERNOON, unsubscribeUrl: unsub })).toMatchObject({ reason: 'ad_no_consent' })
        expect(await dispatch(adPush, { store, drivers: drivers(), now: AFTERNOON })).toMatchObject({ reason: 'ad_no_consent' })
    })

    it('광고 메일은 본문에 수신 거부 자리표시가 없으면 막히고, 있으면 서명 주소로 바뀌어 나간다', async () => {
        const { store } = fakeStore({ switches: on, consent: { email: true } })
        const d = drivers()
        expect(await dispatch(adMail('링크 없음'), { store, drivers: d, now: AFTERNOON, unsubscribeUrl: unsub })).toMatchObject({ reason: 'ad_no_unsubscribe' })
        const r = await dispatch(adMail(), { store, drivers: d, now: AFTERNOON, unsubscribeUrl: unsub })
        expect(r.status).toBe('sent')
        expect(vi.mocked(d.email.send).mock.calls[0][0].body).toContain('https://www.curi-ai.com/api/unsubscribe?t=abc')
        expect(vi.mocked(d.email.send).mock.calls[0][0].body).not.toContain('{{unsubscribe_url}}')
    })

    it('수신 거부 열쇠가 없으면 광고 메일은 막힌다', async () => {
        const { store } = fakeStore({ switches: on, consent: { email: true } })
        expect(await dispatch(adMail(), { store, drivers: drivers(), now: AFTERNOON, unsubscribeUrl: () => null })).toMatchObject({ reason: 'unsubscribe_unavailable' })
    })

    it('광고 문자는 1차에 보내지 않는다', async () => {
        const { store } = fakeStore({ switches: { ...on, CAMPAIGN_INFO: true } })
        // 광고 문자 유형이 장부에 없으므로 장부에서 먼저 막힌다. 장부 밖 경로도 sms_ad_disabled 로 막힌다
        const r = await dispatch({ message: msg('sms', { subject: '(광고) x' }), audience: 'self', type: 'CAMPAIGN_AD_PUSH', campaignKey: 'k' }, { store, drivers: drivers(), now: AFTERNOON, smsEnabled: true })
        expect(r.status).toBe('blocked')
    })

    it('광고 웹 푸시는 본문 끝에 수신 거부 방법이 붙는다', async () => {
        const { store } = fakeStore({ switches: on, consent: { web_push: true } })
        const d = drivers()
        const r = await dispatch(adPush, { store, drivers: d, now: AFTERNOON })
        expect(r.status).toBe('sent')
        expect(vi.mocked(d.push.send).mock.calls[0][0].body).toMatch(/수신 거부: 설정 > 알림$/)
    })

    it('하루 4번째 알림은 막힌다 — 채널 다 합쳐서 센다 (웹 푸시·메일·앱 푸시 모두)', async () => {
        const { store, logs } = fakeStore({ sentToday: 3 })
        const d = drivers()
        const appPush = vi.fn()
        expect(await dispatch({ message: msg('push'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: DAY })).toMatchObject({ reason: 'daily_cap' })
        expect(await dispatch({ message: msg('email'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: DAY })).toMatchObject({ reason: 'daily_cap' })
        expect(await dispatch({ message: { channel: 'push', userId: 'u1', subject: 'a', body: 'b' }, audience: 'self', type: 'P001', appPush: { deeplink: null } }, { store, drivers: d, now: DAY, appPush })).toMatchObject({ reason: 'daily_cap' })
        expect(d.push.send).not.toHaveBeenCalled()
        expect(d.email.send).not.toHaveBeenCalled()
        expect(appPush).not.toHaveBeenCalled()
        expect(logs.every(l => l.error === 'daily_cap')).toBe(true)
    })

    it('하루 3번째까지는 나간다', async () => {
        const { store } = fakeStore({ sentToday: 2 })
        expect((await dispatch({ message: msg('push'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: drivers(), now: DAY })).status).toBe('sent')
    })

    it('광고는 하루 1번·주 3번', async () => {
        const a = fakeStore({ switches: on, consent: { web_push: true }, adToday: 1, sentToday: 1 })
        expect(await dispatch(adPush, { store: a.store, drivers: drivers(), now: AFTERNOON })).toMatchObject({ reason: 'ad_daily_cap' })
        const b = fakeStore({ switches: on, consent: { web_push: true }, adWeek: 3 })
        expect(await dispatch(adPush, { store: b.store, drivers: drivers(), now: AFTERNOON })).toMatchObject({ reason: 'ad_weekly_cap' })
    })

    it('시험 발송은 하루 3번을 건너뛰지만 광고 규칙은 못 건너뛴다', async () => {
        const { store } = fakeStore({ sentToday: 9, switches: on, consent: { web_push: false } })
        expect((await dispatch({ message: msg('push'), audience: 'self', type: 'OWNER_NOTIFY', test: true }, { store, drivers: drivers(), now: DAY })).status).toBe('sent')
        expect(await dispatch({ ...adPush, test: true }, { store, drivers: drivers(), now: AFTERNOON })).toMatchObject({ reason: 'ad_no_consent' })
        expect(await dispatch({ ...adPush, test: true }, { store, drivers: drivers(), now: at21 })).toMatchObject({ reason: 'ad_quiet_hours' })
    })

    it('남에게 보내는 메일(BOT_OUTBOUND)은 보내는 사람의 하루 3번에 들어가지 않는다(따로 잠금 #32)', async () => {
        const { store } = fakeStore({ approved: ['ok-1'], sentToday: 5 })
        expect((await dispatch({ message: msg('email'), audience: 'other', type: 'BOT_OUTBOUND', permissionRequestId: 'ok-1' }, { store, drivers: drivers(), now: DAY })).status).toBe('sent')
    })

    it('같은 유형 + 같은 겹침 열쇠로 이미 보냈으면 막는다 (모든 채널)', async () => {
        const { store } = fakeStore({ sentKeys: ['OWNER_NOTIFY:r1'] })
        expect(await dispatch({ message: msg('email'), audience: 'self', type: 'OWNER_NOTIFY', dedupe: { key: 'r1' } }, { store, drivers: drivers(), now: DAY })).toMatchObject({ reason: 'duplicate' })
        expect((await dispatch({ message: msg('email'), audience: 'self', type: 'OWNER_NOTIFY', dedupe: { key: 'r2' } }, { store, drivers: drivers(), now: DAY })).status).toBe('sent')
    })

    it('받지 않을 사람 명단: 반송 주소는 정보 메일도 막는다', async () => {
        const { store } = fakeStore({ suppressions: [{ hash: h('email', 'JIN@mission-driven.kr'), channel: 'email', reason: 'bounce', scope: 'all', created_at: '2026-09-01T00:00:00Z' }] })
        const d = drivers()
        const r = await dispatch({ message: msg('email'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: d, now: DAY })
        expect(r).toMatchObject({ status: 'blocked', reason: 'suppressed' })
        expect(d.email.send).not.toHaveBeenCalled()
    })

    it('받지 않을 사람 명단: 결번 번호는 문자를 막는다(남에게 보내는 길도)', async () => {
        const { store } = fakeStore({ approved: ['ok-1'], prefs: { sms: true }, suppressions: [{ hash: h('phone', '010-1234-5678'), channel: 'sms', reason: 'dead_number', scope: 'all', created_at: '2026-09-01T00:00:00Z' }] })
        expect(await dispatch({ message: msg('sms'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: drivers(), now: DAY, smsEnabled: true })).toMatchObject({ reason: 'suppressed' })
        expect(await dispatch({ message: msg('sms'), audience: 'other', type: 'BOT_OUTBOUND', permissionRequestId: 'ok-1' }, { store, drivers: drivers(), now: DAY, smsEnabled: true })).toMatchObject({ reason: 'suppressed' })
    })

    it('받지 않을 사람 명단: 수신 거부는 광고만 막고 정보는 보낸다', async () => {
        const row = { hash: h('user', 'u1'), channel: 'web_push' as const, reason: 'unsubscribe' as const, scope: 'ad' as const, created_at: '2026-10-01T00:00:00Z' }
        const { store } = fakeStore({ switches: on, consent: { web_push: true }, suppressions: [row] })
        expect(await dispatch(adPush, { store, drivers: drivers(), now: AFTERNOON })).toMatchObject({ reason: 'suppressed' })
        expect((await dispatch({ message: msg('push'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: drivers(), now: AFTERNOON })).status).toBe('sent')
    })

    it('받지 않을 사람 명단: 탈퇴 지문은 다시 가입한 같은 메일의 광고를 막는다(다시 동의하기 전까지)', async () => {
        const row = { hash: h('email', 'fan@example.com'), channel: 'all' as const, reason: 'deleted_account' as const, scope: 'ad' as const, created_at: '2026-10-02T00:00:00Z' }
        const before = fakeStore({ switches: on, consent: { web_push: true }, account: { email: 'fan@example.com' }, consentAt: '2026-09-01T00:00:00Z', suppressions: [row] })
        expect(await dispatch(adPush, { store: before.store, drivers: drivers(), now: AFTERNOON })).toMatchObject({ reason: 'suppressed' })
        const again = fakeStore({ switches: on, consent: { web_push: true }, account: { email: 'fan@example.com' }, consentAt: '2026-10-02T05:00:00Z', suppressions: [row] })
        expect((await dispatch(adPush, { store: again.store, drivers: drivers(), now: AFTERNOON })).status).toBe('sent')
    })

    it('명단을 못 읽으면 보내지 않는다', async () => {
        const { store } = fakeStore({ fail: 'suppression' })
        expect(await dispatch({ message: msg('email'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: drivers(), now: DAY })).toMatchObject({ reason: 'check_failed' })
    })

    it('상한을 못 세면 보내지 않는다', async () => {
        const { store } = fakeStore({ fail: 'cap' })
        expect(await dispatch({ message: msg('email'), audience: 'self', type: 'OWNER_NOTIFY' }, { store, drivers: drivers(), now: DAY })).toMatchObject({ reason: 'check_failed' })
    })

    it('광고를 남에게 보낼 수 없다', async () => {
        const { store } = fakeStore({ approved: ['ok-1'], switches: on })
        const r = await dispatch({ ...adMail(), audience: 'other', permissionRequestId: 'ok-1' }, { store, drivers: drivers(), now: AFTERNOON, unsubscribeUrl: unsub })
        expect(r.status).toBe('blocked')
    })

    it('기록에 유형·정보/광고·채널·캠페인 열쇠·겹침 열쇠·앱 푸시 묶음 번호가 남는다', async () => {
        const { store, logs } = fakeStore({ switches: on, consent: { app_push: true } })
        const appPush = vi.fn(async () => ({ status: 'sent' as const, batchId: 'batch-7', delivered: 1, failed: 0, disabled: 0, sendIds: ['s'] }))
        await dispatch({ ...adPush, appPush: { deeplink: null }, dedupe: { key: 'k1' } }, { store, drivers: drivers(), now: AFTERNOON, appPush })
        expect(logs[0]).toMatchObject({ msgType: 'CAMPAIGN_AD_PUSH', category: 'ad', route: 'app_push', campaignKey: CK3, dedupeKey: 'k1', batchId: 'batch-7', status: 'sent' })
        expect(appPush).toHaveBeenCalledWith(expect.objectContaining({ category: 'ad', type: 'CAMPAIGN_AD_PUSH' }))
    })
})
