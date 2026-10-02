import { describe, it, expect, vi } from 'vitest'
import { sendPush } from '../send'
import { kstDayStart, isAdQuietHour, AD_FOOTER } from '../rules'
import type { PushDevice, PushSendRow, PushStore, Transport, PushInput, Platform } from '../types'

// 서울 시각 (UTC+9)
const kst = (h: number, m = 0, day = 2) => new Date(Date.UTC(2026, 9, day, h - 9, m))

const IOS: PushDevice = { id: 'd-ios', userId: 'u1', platform: 'ios', token: 'aaaa', apnsEnv: 'production' }
const AND: PushDevice = { id: 'd-and', userId: 'u1', platform: 'android', token: 'bbbb', apnsEnv: null }

function fakeTransport(result: Awaited<ReturnType<Transport['send']>> = { ok: true }, ready = true) {
    return { ready: () => ready, send: vi.fn<Transport['send']>(async () => result) }
}

function fakeStore(opts: {
    devices?: PushDevice[]
    sentToday?: number
    adToday?: number
    adWeek?: number
    consent?: boolean
    prefs?: { push: boolean; quietFrom: string | null; quietTo: string | null }
    sentKeys?: string[]
} = {}) {
    const rows: PushSendRow[] = []
    const disabled: string[] = []
    const store: PushStore = {
        listDevices: async () => opts.devices ?? [IOS],
        countSentBatches: async (_u, since, category) => {
            const weekly = since.getTime() < kstDayStart(kst(12)).getTime()   // 서울 오늘 자정보다 앞 = 7일 창
            if (category === 'ad') return weekly ? (opts.adWeek ?? 0) : (opts.adToday ?? 0)
            return opts.sentToday ?? 0
        },
        hasSent: async (_u, type, key) => (opts.sentKeys ?? []).includes(`${type}:${key}`),
        hasMarketingConsent: async () => opts.consent ?? false,
        getPrefs: async () => opts.prefs ?? { push: true, quietFrom: '22:00', quietTo: '08:00' },
        insertSends: async r => { rows.push(...r) },
        disableDevice: async id => { disabled.push(id) },
    }
    return { store, rows, disabled }
}

let n = 0
const deps = (store: PushStore, now: Date, transports?: Partial<Record<Platform, Transport>>) => ({
    store,
    transports: { ios: fakeTransport(), android: fakeTransport(), ...transports },
    now: () => now,
    newId: () => `id-${++n}`,
})

const INFO: PushInput = { userId: 'u1', type: 'P001', category: 'info', title: '기획팀장이 아침 정리를 마쳤어요', body: '눌러서 확인해 보세요', deeplink: 'curiai://bot/m1' }
const AD: PushInput = { userId: 'u1', type: 'P089', category: 'ad', title: '(광고) 기획팀장', body: '잘 지내세요?', deeplink: 'curiai://bot/m1' }

describe('서울 날짜 계산', () => {
    it('하루의 시작은 서울 자정이다', () => {
        expect(kstDayStart(kst(0, 30)).toISOString()).toBe('2026-10-01T15:00:00.000Z')
        expect(kstDayStart(kst(23, 59)).toISOString()).toBe('2026-10-01T15:00:00.000Z')
    })
    it('광고 금지 시간은 서울 21:00~08:00 (끝은 미포함)', () => {
        expect(isAdQuietHour(kst(20, 59))).toBe(false)
        expect(isAdQuietHour(kst(21, 0))).toBe(true)
        expect(isAdQuietHour(kst(3, 0))).toBe(true)
        expect(isAdQuietHour(kst(7, 59))).toBe(true)
        expect(isAdQuietHour(kst(8, 0))).toBe(false)
    })
})

describe('sendPush — 열쇠', () => {
    it('열쇠가 하나도 없으면 DB 를 건드리지 않고 not_configured 로 끝난다', async () => {
        const { store, rows } = fakeStore()
        const spy = vi.spyOn(store, 'listDevices')
        const out = await sendPush(INFO, deps(store, kst(14), { ios: fakeTransport({ ok: true }, false), android: fakeTransport({ ok: true }, false) }))
        expect(out).toEqual({ skipped: 'not_configured' })
        expect(spy).not.toHaveBeenCalled()
        expect(rows).toHaveLength(0)
    })
})

describe('sendPush — 하루 상한 (서울 기준)', () => {
    it('하루 3번째까지는 보낸다', async () => {
        const { store, rows } = fakeStore({ sentToday: 2 })
        const out = await sendPush(INFO, deps(store, kst(14)))
        expect(out).toMatchObject({ status: 'sent', delivered: 1 })
        expect(rows[0]).toMatchObject({ status: 'sent', deviceId: 'd-ios', pushType: 'P001' })
    })
    it('이미 3번 보냈으면 막고 막힌 기록 한 줄을 남긴다', async () => {
        const { store, rows } = fakeStore({ sentToday: 3 })
        const t = fakeTransport()
        const out = await sendPush(INFO, deps(store, kst(14), { ios: t }))
        expect(out).toEqual({ status: 'blocked', reason: 'daily_cap' })
        expect(t.send).not.toHaveBeenCalled()
        expect(rows).toEqual([expect.objectContaining({ status: 'blocked', error: 'daily_cap', deviceId: null })])
    })
    it('광고는 하루 1번', async () => {
        const { store } = fakeStore({ consent: true, adToday: 1 })
        expect(await sendPush(AD, deps(store, kst(14)))).toEqual({ status: 'blocked', reason: 'ad_daily_cap' })
    })
    it('광고는 주 3번', async () => {
        const { store } = fakeStore({ consent: true, adToday: 0, adWeek: 3 })
        expect(await sendPush(AD, deps(store, kst(14)))).toEqual({ status: 'blocked', reason: 'ad_weekly_cap' })
    })
})

describe('sendPush — 광고 규칙', () => {
    it('광고 동의가 없으면 보내지 않는다', async () => {
        const { store } = fakeStore({ consent: false })
        expect(await sendPush(AD, deps(store, kst(14)))).toEqual({ status: 'blocked', reason: 'ad_no_consent' })
    })
    it('제목이 「(광고)」로 시작하지 않으면 보내지 않는다', async () => {
        const { store } = fakeStore({ consent: true })
        expect(await sendPush({ ...AD, title: '기획팀장' }, deps(store, kst(14)))).toEqual({ status: 'blocked', reason: 'ad_title_prefix' })
    })
    it('밤 21시부터 아침 8시 전까지 광고는 막는다', async () => {
        const { store } = fakeStore({ consent: true })
        expect(await sendPush(AD, deps(store, kst(21, 0)))).toEqual({ status: 'blocked', reason: 'ad_quiet_hours' })
        expect(await sendPush(AD, deps(store, kst(7, 30)))).toEqual({ status: 'blocked', reason: 'ad_quiet_hours' })
    })
    it('관리자 시험 발송이어도 광고 규칙은 그대로 막는다', async () => {
        const { store } = fakeStore({ consent: false })
        expect(await sendPush({ ...AD, ignoreLimits: true }, deps(store, kst(14)))).toEqual({ status: 'blocked', reason: 'ad_no_consent' })
    })
    it('조건을 다 맞추면 보내고, 본문 끝에 수신 거부 방법을 붙인다', async () => {
        const { store, rows } = fakeStore({ consent: true })
        const t = fakeTransport()
        const out = await sendPush(AD, deps(store, kst(9), { ios: t }))
        expect(out).toMatchObject({ status: 'sent' })
        expect(rows[0].body.endsWith(AD_FOOTER)).toBe(true)
        expect(t.send.mock.calls[0][1]).toMatchObject({ title: '(광고) 기획팀장' })
    })
})

describe('sendPush — 정보 알림의 조용한 시간과 설정', () => {
    it('정보 알림은 21시에 가지만 23시(사용자 조용한 시간)엔 보류한다', async () => {
        const { store } = fakeStore()
        expect(await sendPush(INFO, deps(store, kst(21, 30)))).toMatchObject({ status: 'sent' })
        expect(await sendPush(INFO, deps(store, kst(23, 0)))).toEqual({ status: 'blocked', reason: 'quiet_hours' })
    })
    it('알림 설정에서 푸시를 껐으면 보내지 않는다', async () => {
        const { store } = fakeStore({ prefs: { push: false, quietFrom: null, quietTo: null } })
        expect(await sendPush(INFO, deps(store, kst(14)))).toEqual({ status: 'blocked', reason: 'push_off' })
    })
    it('관리자 시험 발송은 상한·조용한 시간을 건너뛴다', async () => {
        const { store } = fakeStore({ sentToday: 5 })
        expect(await sendPush({ ...INFO, type: 'TEST', ignoreLimits: true }, deps(store, kst(23)))).toMatchObject({ status: 'sent' })
    })
})

describe('sendPush — 겹침 막기', () => {
    it('같은 소식(type+key)을 이미 보냈으면 막는다', async () => {
        const { store } = fakeStore({ sentKeys: ['P033:m1'] })
        expect(await sendPush({ ...INFO, type: 'P033', dedupe: { key: 'm1' } }, deps(store, kst(14)))).toEqual({ status: 'blocked', reason: 'duplicate' })
    })
    it('겹침 열쇠는 기록에 남는다', async () => {
        const { store, rows } = fakeStore()
        await sendPush({ ...INFO, dedupe: { key: 'room-1', withinMinutes: 10 } }, deps(store, kst(14)))
        expect(rows[0].dedupeKey).toBe('room-1')
    })
})

describe('sendPush — 기기별 보내기와 죽은 기기 끄기', () => {
    it('아이폰·안드로이드 기기마다 한 줄씩 남기고, 같은 묶음 번호를 쓴다', async () => {
        const { store, rows } = fakeStore({ devices: [IOS, AND] })
        const out = await sendPush(INFO, deps(store, kst(14)))
        expect(out).toMatchObject({ status: 'sent', delivered: 2, failed: 0 })
        expect(rows).toHaveLength(2)
        expect(new Set(rows.map(r => r.batchId)).size).toBe(1)
        expect(new Set(rows.map(r => r.id)).size).toBe(2)
    })
    it('애플이 기기 번호가 죽었다고 하면 그 기기를 끄고 실패로 남긴다', async () => {
        const { store, rows, disabled } = fakeStore({ devices: [IOS, AND] })
        const out = await sendPush(INFO, deps(store, kst(14), { ios: fakeTransport({ ok: false, error: 'apns 410 Unregistered', disable: true }) }))
        expect(out).toMatchObject({ status: 'sent', delivered: 1, failed: 1, disabled: 1 })
        expect(disabled).toEqual(['d-ios'])
        expect(rows.find(r => r.deviceId === 'd-ios')).toMatchObject({ status: 'failed', error: 'apns 410 Unregistered' })
    })
    it('일시 오류는 기기를 끄지 않는다', async () => {
        const { store, disabled } = fakeStore()
        const out = await sendPush(INFO, deps(store, kst(14), { ios: fakeTransport({ ok: false, error: 'apns 503', disable: false }) }))
        expect(out).toMatchObject({ status: 'failed', delivered: 0, failed: 1, disabled: 0 })
        expect(disabled).toEqual([])
    })
    it('기기가 없으면 no_device', async () => {
        const { store } = fakeStore({ devices: [] })
        expect(await sendPush(INFO, deps(store, kst(14)))).toEqual({ status: 'blocked', reason: 'no_device' })
    })
    it('열쇠가 없는 쪽(안드로이드) 기기는 건너뛰고 아이폰만 보낸다', async () => {
        const { store, rows } = fakeStore({ devices: [IOS, AND] })
        const out = await sendPush(INFO, deps(store, kst(14), { android: fakeTransport({ ok: true }, false) }))
        expect(out).toMatchObject({ status: 'sent', delivered: 1 })
        expect(rows.map(r => r.deviceId)).toEqual(['d-ios'])
    })
    it('보낼 때 기록 번호(sendId)를 알림에 실어 보낸다', async () => {
        const { store, rows } = fakeStore()
        const t = fakeTransport()
        await sendPush(INFO, deps(store, kst(14), { ios: t }))
        expect(t.send.mock.calls[0][1]).toMatchObject({ sendId: rows[0].id, deeplink: 'curiai://bot/m1', type: 'P001' })
    })
})
