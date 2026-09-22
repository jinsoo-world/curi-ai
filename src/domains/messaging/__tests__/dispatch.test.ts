import { describe, it, expect, vi } from 'vitest'
import { dispatch } from '../dispatch'
import type { Channel, Driver, MessagingStore, MessageLogEntry, NotificationPrefs, OutboundMessage } from '../types'
import { DEFAULT_PREFS } from '../types'

// 서울 시각 (UTC+9). 14:00 = 낮, 23:30 = 조용한 시간
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

function fakeStore(opts: { approved?: string[]; prefs?: Partial<NotificationPrefs> } = {}) {
    const logs: MessageLogEntry[] = []
    const store: MessagingStore = {
        async getApprovedRequest(id, userId) {
            return (opts.approved ?? []).includes(id) ? { id, userId } : null
        },
        async getPrefs() { return { ...DEFAULT_PREFS, ...(opts.prefs ?? {}) } },
        async log(entry) { logs.push(entry) },
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
        const r = await dispatch({ message: msg('push'), audience: 'self' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('sent')
        expect(d.push.send).toHaveBeenCalledTimes(1)
        expect(logs).toHaveLength(1)
        expect(logs[0].status).toBe('sent')
        expect(logs[0].channel).toBe('push')
    })

    it('봇이 남에게 보내는데 승인 카드가 없으면 blocked — 드라이버를 부르지도 않는다', async () => {
        const { store, logs } = fakeStore()
        const d = drivers()
        const r = await dispatch({ message: msg('email'), audience: 'other' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('blocked')
        expect(r.reason).toBe('no_permission')
        expect(d.email.send).not.toHaveBeenCalled()
        expect(logs[0].status).toBe('blocked')
    })

    it('승인 카드 id 가 있어도 allowed 상태가 아니면(없는 카드·남의 카드·pending) blocked', async () => {
        const { store } = fakeStore({ approved: ['ok-1'] })
        const d = drivers()
        const r = await dispatch({ message: msg('email'), audience: 'other', permissionRequestId: 'pending-9' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('blocked')
        expect(r.reason).toBe('no_permission')
        expect(d.email.send).not.toHaveBeenCalled()
    })

    it('allowed 카드가 있으면 남에게도 나간다. 로그에 카드 id 가 남는다', async () => {
        const { store, logs } = fakeStore({ approved: ['ok-1'] })
        const d = drivers()
        const r = await dispatch({ message: msg('email'), audience: 'other', permissionRequestId: 'ok-1' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('sent')
        expect(d.email.send).toHaveBeenCalledTimes(1)
        expect(logs[0].permissionRequestId).toBe('ok-1')
    })

    it('초안만 만드는 봇(draft_only)은 카드가 있어도 밖으로 못 보낸다', async () => {
        const { store } = fakeStore({ approved: ['ok-1'] })
        const d = drivers()
        const r = await dispatch({ message: msg('email'), audience: 'other', permissionRequestId: 'ok-1', approvalMode: 'draft_only' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('blocked')
        expect(r.reason).toBe('draft_only')
        expect(d.email.send).not.toHaveBeenCalled()
    })

    it('SMS_ENABLED 가 없으면 문자는 기록만 하고 blocked (돈 드는 채널)', async () => {
        const { store, logs } = fakeStore({ prefs: { sms: true } })
        const d = drivers()
        const r = await dispatch({ message: msg('sms'), audience: 'self' }, { store, drivers: d, now: DAY, smsEnabled: false })
        expect(r.status).toBe('blocked')
        expect(r.reason).toBe('sms_disabled')
        expect(d.sms.send).not.toHaveBeenCalled()
        expect(logs[0].status).toBe('blocked')
    })

    it('SMS_ENABLED=true 이고 문자를 켜 두었으면 나간다', async () => {
        const { store } = fakeStore({ prefs: { sms: true } })
        const d = drivers()
        const r = await dispatch({ message: msg('sms'), audience: 'self' }, { store, drivers: d, now: DAY, smsEnabled: true })
        expect(r.status).toBe('sent')
        expect(d.sms.send).toHaveBeenCalledTimes(1)
    })

    it('조용한 시간(23:30)엔 푸시·문자는 보류(blocked/quiet_hours), 이메일은 나간다', async () => {
        const { store } = fakeStore({ prefs: { sms: true } })
        const d = drivers()
        const push = await dispatch({ message: msg('push'), audience: 'self' }, { store, drivers: d, now: NIGHT })
        const sms = await dispatch({ message: msg('sms'), audience: 'self' }, { store, drivers: d, now: NIGHT, smsEnabled: true })
        const email = await dispatch({ message: msg('email'), audience: 'self' }, { store, drivers: d, now: NIGHT })
        expect(push).toMatchObject({ status: 'blocked', reason: 'quiet_hours' })
        expect(sms).toMatchObject({ status: 'blocked', reason: 'quiet_hours' })
        expect(email.status).toBe('sent')
        expect(d.push.send).not.toHaveBeenCalled()
        expect(d.sms.send).not.toHaveBeenCalled()
    })

    it('사용자가 정한 조용한 시간을 따른다', async () => {
        const { store } = fakeStore({ prefs: { quietFrom: '13:00', quietTo: '15:00' } })
        const d = drivers()
        const r = await dispatch({ message: msg('push'), audience: 'self' }, { store, drivers: d, now: DAY })
        expect(r).toMatchObject({ status: 'blocked', reason: 'quiet_hours' })
    })

    it('내가 그 채널을 꺼 두었으면(푸시 off) 내게 오는 알림은 blocked', async () => {
        const { store } = fakeStore({ prefs: { push: false } })
        const d = drivers()
        const r = await dispatch({ message: msg('push'), audience: 'self' }, { store, drivers: d, now: DAY })
        expect(r).toMatchObject({ status: 'blocked', reason: 'channel_off' })
        expect(d.push.send).not.toHaveBeenCalled()
    })

    it('문자는 기본이 꺼져 있다(기본값 sms=false)', async () => {
        const { store } = fakeStore()
        const d = drivers()
        const r = await dispatch({ message: msg('sms'), audience: 'self' }, { store, drivers: d, now: DAY, smsEnabled: true })
        expect(r).toMatchObject({ status: 'blocked', reason: 'channel_off' })
    })

    it('열쇠가 없어 드라이버가 준비 안 됐으면 blocked (죽지 않는다)', async () => {
        const { store, logs } = fakeStore()
        const d = drivers({ email: fakeDriver({ ready: false }) })
        const r = await dispatch({ message: msg('email'), audience: 'self' }, { store, drivers: d, now: DAY })
        expect(r).toMatchObject({ status: 'blocked', reason: 'driver_not_ready' })
        expect(logs[0].status).toBe('blocked')
    })

    it('드라이버가 실패하면 failed 로 기록한다', async () => {
        const { store, logs } = fakeStore()
        const d = drivers({ push: fakeDriver({ ok: false }) })
        const r = await dispatch({ message: msg('push'), audience: 'self' }, { store, drivers: d, now: DAY })
        expect(r.status).toBe('failed')
        expect(logs[0].status).toBe('failed')
        expect(logs[0].error).toBe('서버가 거절했어요')
    })

    it('로그에는 받는 곳 끝 4자만 남는다(전화번호 전체 금지)', async () => {
        const { store, logs } = fakeStore({ prefs: { sms: true } })
        await dispatch({ message: msg('sms'), audience: 'self' }, { store, drivers: drivers(), now: DAY, smsEnabled: true })
        expect(logs[0].toHint).toBe('5678')
        expect(JSON.stringify(logs[0])).not.toContain('01012345678')
    })

    it('기록 저장이 실패해도(표 없음) 결과는 돌려준다', async () => {
        const { store } = fakeStore()
        store.log = async () => { throw new Error('relation "message_log" does not exist') }
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const r = await dispatch({ message: msg('push'), audience: 'self' }, { store, drivers: drivers(), now: DAY })
        expect(r.status).toBe('sent')
        warn.mockRestore()
    })
})
