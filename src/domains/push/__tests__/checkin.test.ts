import { describe, it, expect, vi } from 'vitest'
import { p089CheckIn, P089_DEDUPE_MINUTES } from '../catalog'
import { pickP089Targets, runP089, P089_BATCH_LIMIT, type P089Reader } from '../checkin'
import { sendPush } from '../send'
import { kstDayStart } from '../rules'
import type { PushInput, PushStore, PushSendRow, Transport } from '../types'

// 서울 시각 (UTC+9). 기본 = 2026-10-05 10:00 KST
const kst = (h: number, m = 0, day = 5) => new Date(Date.UTC(2026, 9, day, h - 9, m))
const NOW = kst(10)
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

describe('P089 문구', () => {
    it('광고: 제목은 (광고)로 시작, 7일 겹침 막기, 기획팀장 방으로 간다', () => {
        const p = p089CheckIn({ userId: 'u1', mentorId: 'm1', botName: '기획팀장' })
        expect(p.type).toBe('P089')
        expect(p.category).toBe('ad')
        expect(p.title.startsWith('(광고)')).toBe(true)
        expect(p.title).toBe('(광고) 잘 지내세요?')
        expect(p.body).toBe('기획팀장이 이번 주 할 일을 정리해 둘 준비가 됐어요. 한마디만 건네 주세요.')
        expect(p.deeplink).toBe('curiai://bot/m1')
        expect(p.dedupe).toEqual({ key: 'checkin', withinMinutes: 7 * 24 * 60 })
        expect(P089_DEDUPE_MINUTES).toBe(10080)
    })
    it('기획팀장 봇이 없으면 홈으로, 문구는 「봇들이」', () => {
        const p = p089CheckIn({ userId: 'u1', mentorId: null })
        expect(p.deeplink).toBe('curiai://home')
        expect(p.body).toBe('봇들이 이번 주 할 일을 정리해 둘 준비가 됐어요. 한마디만 건네 주세요.')
    })
})

describe('pickP089Targets — 고르기', () => {
    const base = {
        now: NOW,
        devices: [] as { userId: string; lastSeenAt: string }[],
        activeRecently: new Set<string>(),
        consented: new Set<string>(['u1', 'u2', 'u3', 'u4', 'u5']),
        sentRecently: new Set<string>(),
        limit: 500,
    }
    it('마지막 접속이 3~4일 전인 사람만', () => {
        const out = pickP089Targets({
            ...base,
            devices: [
                { userId: 'u1', lastSeenAt: daysAgo(2) },     // 2일 = 아직 이르다
                { userId: 'u2', lastSeenAt: daysAgo(3.5) },   // 3.5일 = 대상
                { userId: 'u3', lastSeenAt: daysAgo(4.5) },   // 4.5일 = 지났다
                { userId: 'u4', lastSeenAt: daysAgo(3) },     // 딱 3일 = 대상
                { userId: 'u5', lastSeenAt: daysAgo(4) },     // 딱 4일 = 지났다(끝 미포함)
            ],
        })
        expect(out.sort()).toEqual(['u2', 'u4'])
    })
    it('기기가 여러 대면 가장 최근 기기로 본다', () => {
        const out = pickP089Targets({
            ...base,
            devices: [{ userId: 'u1', lastSeenAt: daysAgo(3.5) }, { userId: 'u1', lastSeenAt: daysAgo(1) }],
        })
        expect(out).toEqual([])
    })
    it('3일 안에 대화했으면(웹 포함) 빼고, 광고 동의 없으면 빼고, 7일 안에 받았으면 뺀다', () => {
        const out = pickP089Targets({
            ...base,
            devices: ['u1', 'u2', 'u3', 'u9'].map(userId => ({ userId, lastSeenAt: daysAgo(3.5) })),
            activeRecently: new Set(['u1']),
            sentRecently: new Set(['u2']),
        })
        expect(out).toEqual(['u3'])   // u9 = 동의 없음
    })
    it('한 번에 limit 명까지만', () => {
        const ids = Array.from({ length: 30 }, (_, i) => `x${i}`)
        const out = pickP089Targets({
            ...base,
            devices: ids.map(userId => ({ userId, lastSeenAt: daysAgo(3.5) })),
            consented: new Set(ids),
            limit: 10,
        })
        expect(out).toHaveLength(10)
        expect(P089_BATCH_LIMIT).toBe(500)
    })
})

function fakeReader(over: Partial<P089Reader> = {}): P089Reader {
    return {
        devicesSeenSince: vi.fn(async () => [
            { userId: 'u1', lastSeenAt: daysAgo(3.5) },
            { userId: 'u2', lastSeenAt: daysAgo(3.2) },
            { userId: 'u3', lastSeenAt: daysAgo(1) },
        ]),
        usersActiveSince: vi.fn(async () => new Set<string>()),
        consented: vi.fn(async (ids: string[]) => new Set(ids.filter(i => i !== 'u2'))),
        sentP089Since: vi.fn(async () => new Set<string>()),
        planningBots: vi.fn(async () => new Map([['u1', { mentorId: 'm1', name: '기획팀장' }]])),
        ...over,
    }
}

describe('runP089 — 예약 작업 한 번', () => {
    it('광고 금지 시간(21~08시)이면 DB 도 안 읽고 끝난다', async () => {
        const reader = fakeReader()
        const send = vi.fn()
        const r = await runP089({ reader, send, now: kst(7, 59) })
        expect(r).toEqual({ skipped: 'ad_quiet_hours' })
        expect(reader.devicesSeenSince).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalled()
    })
    it('고른 사람에게만 P089 를 보낸다. 창은 4일 전부터 읽고, 활동·발송 기록은 3일·7일로 본다', async () => {
        const reader = fakeReader()
        const sent: PushInput[] = []
        const r = await runP089({ reader, send: async p => { sent.push(p); return 'sent' }, now: NOW })
        expect(sent.map(p => p.userId)).toEqual(['u1'])   // u2 동의 없음, u3 최근 접속
        expect(sent[0]).toMatchObject({ type: 'P089', deeplink: 'curiai://bot/m1' })
        expect(r).toEqual({ candidates: 1, sent: 1, blocked: 0, failed: 0, deferred: 0, via: 'js' })
        expect((reader.devicesSeenSince as ReturnType<typeof vi.fn>).mock.calls[0][0].toISOString()).toBe(daysAgo(4))
        expect((reader.usersActiveSince as ReturnType<typeof vi.fn>).mock.calls[0][1].toISOString()).toBe(daysAgo(3))
        expect((reader.sentP089Since as ReturnType<typeof vi.fn>).mock.calls[0][1].toISOString()).toBe(daysAgo(7))
    })
    it('보내기가 하나 실패해도 나머지는 간다', async () => {
        const reader = fakeReader({ consented: async ids => new Set(ids) })
        let i = 0
        const r = await runP089({
            reader, now: NOW,
            send: async () => { if (i++ === 0) throw new Error('boom'); return 'blocked' },
        })
        expect(r).toEqual({ candidates: 2, sent: 0, blocked: 1, failed: 1, deferred: 0, via: 'js' })
    })
})
describe('runP089 — DB 함수 한 번으로 고르기 + 전체 마감', () => {
    it('DB 함수(p089_candidates)가 있으면 그 결과만 쓰고 사람마다 묻지 않는다', async () => {
        const reader = fakeReader({ candidates: vi.fn(async () => [{ userId: 'u9', mentorId: 'm9', botName: '기획팀장' }]) })
        const sent: string[] = []
        const r = await runP089({ reader, send: async p => { sent.push(p.userId); return 'sent' }, now: NOW })
        expect(sent).toEqual(['u9'])
        expect(reader.devicesSeenSince).not.toHaveBeenCalled()
        expect(reader.usersActiveSince).not.toHaveBeenCalled()
        expect(r).toMatchObject({ candidates: 1, sent: 1, via: 'sql' })
    })
    it('함수가 아직 없으면(null) 예전 길', async () => {
        const reader = fakeReader({ candidates: vi.fn(async () => null) })
        const r = await runP089({ reader, send: async () => 'sent', now: NOW })
        expect(reader.devicesSeenSince).toHaveBeenCalled()
        expect(r).toMatchObject({ via: 'js' })
    })
    it('마감이 지나면 남은 사람에게 보내지 않는다(내일 다시 고름)', async () => {
        const many = Array.from({ length: 20 }, (_, i) => ({ userId: `u${i}`, mentorId: null, botName: null }))
        const reader = fakeReader({ candidates: vi.fn(async () => many) })
        const r = await runP089({ reader, send: async () => { await new Promise(res => setTimeout(res, 15)); return 'sent' }, now: NOW, deadline: Date.now() + 5 })
        expect(r).toMatchObject({ candidates: 20 })
        if ('deferred' in r) {
            expect(r.deferred).toBeGreaterThan(0)
            expect(r.sent + r.deferred).toBe(20)
        }
    })
})


describe('P089 은 sendPush 관문 규칙을 그대로 받는다', () => {
    const IOS = { id: 'd1', userId: 'u1', platform: 'ios' as const, token: 'aa', apnsEnv: 'production' as const }
    const t = (): Transport => ({ ready: () => true, send: async () => ({ ok: true }) })
    function store(o: { consent?: boolean; sentKeys?: string[]; adWeek?: number }) {
        const rows: PushSendRow[] = []
        const s: PushStore = {
            listDevices: async () => [IOS],
            countSentBatches: async (_u, since, category) => (category === 'ad' && since.getTime() < kstDayStart(NOW).getTime() ? (o.adWeek ?? 0) : 0),
            hasSent: async (_u, type, key, since) => {
                expect(since).not.toBeNull()   // 7일 창 안에서만 막는다(평생 1번이 아니다)
                return (o.sentKeys ?? []).includes(`${type}:${key}`)
            },
            hasMarketingConsent: async () => o.consent ?? true,
            getPrefs: async () => ({ push: true, quietFrom: '22:00', quietTo: '08:00' }),
            insertSends: async r => { rows.push(...r) },
            disableDevice: async () => {},
        }
        return { s, rows }
    }
    const P = p089CheckIn({ userId: 'u1', mentorId: 'm1', botName: '기획팀장' })
    const go = (s: PushStore, now = NOW) => sendPush(P, { store: s, transports: { ios: t(), android: t() }, now: () => now, newId: () => Math.random().toString(36) })

    it('동의 + 낮 10시 = 간다, 본문 끝에 수신 거부 방법', async () => {
        const { s, rows } = store({})
        expect(await go(s)).toMatchObject({ status: 'sent', delivered: 1 })
        expect(rows[0].body.endsWith('수신 거부: 설정 > 알림')).toBe(true)
    })
    it('광고 동의 없음 = 막힘', async () => {
        expect(await go(store({ consent: false }).s)).toEqual({ status: 'blocked', reason: 'ad_no_consent' })
    })
    it('밤 9시 = 막힘', async () => {
        expect(await go(store({}).s, kst(21))).toEqual({ status: 'blocked', reason: 'ad_quiet_hours' })
    })
    it('7일 안에 이미 받았으면 = 막힘', async () => {
        expect(await go(store({ sentKeys: ['P089:checkin'] }).s)).toEqual({ status: 'blocked', reason: 'duplicate' })
    })
    it('광고 주 3번을 다 썼으면 = 막힘', async () => {
        expect(await go(store({ adWeek: 3 }).s)).toEqual({ status: 'blocked', reason: 'ad_weekly_cap' })
    })
})
