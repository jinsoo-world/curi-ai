// 봇이 남에게 보내는 메일 잠금 (1002 설계 8번). 큐리어스와 같은 SES 계정을 쓰니 한 사람의 남용이 회사 평판을 깬다.
import { describe, it, expect, vi } from 'vitest'
import { guardOutboundEmail, hashRecipient, kstDayStart, DAILY_MAIL_CAP, DAILY_NEW_RECIPIENT_CAP } from '../outbound-guard'
import type { OutboundGuardStore } from '../outbound-guard'

const NOW = () => new Date('2026-10-02T05:00:00Z')   // 서울 14:00

function fakeStore(opts: { sent?: (string | null)[] | number; hashKnown?: boolean; suppressed?: string[]; suppressionError?: boolean } = {}) {
    const store: OutboundGuardStore = {
        countSentToday: vi.fn(async () => {
            if (typeof opts.sent === 'number') return { total: opts.sent, recipientHashes: null }
            const rows = opts.sent ?? []
            return { total: rows.length, recipientHashes: opts.hashKnown === false ? null : rows }
        }),
        isSuppressed: vi.fn(async (email: string) => {
            if (opts.suppressionError) throw new Error('AccessDenied')
            return (opts.suppressed ?? []).includes(email)
        }),
    }
    return store
}

const input = (extra: Record<string, unknown> = {}) => ({ userId: 'u1', to: 'fan@example.com', subject: '수업 자료 보내드려요', body: '어제 말씀하신 자료예요.', ...extra })
const run = (store: OutboundGuardStore, extra: Record<string, unknown> = {}, env: Record<string, string | undefined> = {}) =>
    guardOutboundEmail(input(extra), { store, now: NOW, env })

describe('outbound-guard — 남에게 가는 메일 잠금', () => {
    it('평범한 1:1 안내 메일은 통과하고, 받는 주소 지문을 돌려준다', async () => {
        const r = await run(fakeStore())
        expect(r).toEqual({ ok: true, toHash: hashRecipient('fan@example.com') })
    })

    it('주소 지문은 대소문자·앞뒤 빈칸이 달라도 같다', () => {
        expect(hashRecipient(' Fan@Example.COM ')).toBe(hashRecipient('fan@example.com'))
        expect(hashRecipient('fan@example.com')).toMatch(/^[0-9a-f]{64}$/)
    })

    it('서울 기준 오늘 0시를 쓴다', () => {
        expect(kstDayStart(new Date('2026-10-02T05:00:00Z')).toISOString()).toBe('2026-10-01T15:00:00.000Z')
        expect(kstDayStart(new Date('2026-10-01T16:30:00Z')).toISOString()).toBe('2026-10-01T15:00:00.000Z')   // 서울 10/2 01:30
        expect(kstDayStart(new Date('2026-10-01T14:30:00Z')).toISOString()).toBe('2026-09-30T15:00:00.000Z')   // 서울 10/1 23:30
    })

    describe('끄는 스위치 OS_OUTBOUND_MAIL_ENABLED', () => {
        it("'0' 이면 막는다. DB 도 안 본다", async () => {
            const store = fakeStore()
            const r = await run(store, {}, { OS_OUTBOUND_MAIL_ENABLED: '0' })
            expect(r.ok).toBe(false)
            if (!r.ok) {
                expect(r.status).toBe(503)
                expect(r.error).toContain('잠시 멈춰')
            }
            expect(store.countSentToday).not.toHaveBeenCalled()
        })
        it('값이 없거나 1 이면 지금처럼 켜져 있다', async () => {
            expect((await run(fakeStore(), {}, {})).ok).toBe(true)
            expect((await run(fakeStore(), {}, { OS_OUTBOUND_MAIL_ENABLED: '1' })).ok).toBe(true)
        })
    })

    describe('한 번에 한 분에게만', () => {
        it.each([
            ['쉼표', 'a@x.com,b@x.com'],
            ['세미콜론', 'a@x.com; b@x.com'],
            ['빈칸', 'a@x.com b@x.com'],
            ['배열 두 개', ['a@x.com', 'b@x.com']],
        ])('%s 로 여러 명을 넣으면 막는다', async (_n, to) => {
            const r = await run(fakeStore(), { to })
            expect(r.ok).toBe(false)
            if (!r.ok) {
                expect(r.status).toBe(400)
                expect(r.error).toBe('메일은 한 번에 한 분에게만 보낼 수 있어요.')
            }
        })
        it('주소 모양이 이상하면 막는다', async () => {
            const r = await run(fakeStore(), { to: 'not-an-email' })
            expect(r.ok).toBe(false)
            if (!r.ok) expect(r.status).toBe(400)
        })
        it('배열에 한 명만 있으면 그 한 명으로 본다', async () => {
            expect((await run(fakeStore(), { to: ['fan@example.com'] })).ok).toBe(true)
        })
    })

    describe('광고·단체 메일 표시가 있으면 막는다', () => {
        it.each([
            ['제목 (광고)', { subject: '(광고) 가을 특가' }],
            ['제목 [광고]', { subject: '[광고] 가을 특가' }],
            ['본문 수신거부', { body: '원치 않으시면 수신거부 해 주세요' }],
            ['본문 수신 거부', { body: '수신 거부: 080-000-0000' }],
            ['html unsubscribe', { html: '<a href="x">Unsubscribe</a>' }],
            ['본문 opt-out', { body: 'reply STOP to opt-out' }],
        ])('%s', async (_n, extra) => {
            const store = fakeStore()
            const r = await run(store, extra)
            expect(r.ok).toBe(false)
            if (!r.ok) {
                expect(r.status).toBe(400)
                expect(r.error).toContain('광고')
            }
            expect(store.isSuppressed).not.toHaveBeenCalled()
        })
    })

    describe('하루 상한 (서울 기준)', () => {
        it(`오늘 ${DAILY_MAIL_CAP}통을 이미 보냈으면 막는다`, async () => {
            const same = Array(DAILY_MAIL_CAP).fill(hashRecipient('fan@example.com'))
            const r = await run(fakeStore({ sent: same }))
            expect(r.ok).toBe(false)
            if (!r.ok) {
                expect(r.status).toBe(429)
                expect(r.error).toContain(`${DAILY_MAIL_CAP}통`)
            }
        })
        it(`${DAILY_MAIL_CAP - 1}통까지는 보낼 수 있다`, async () => {
            const same = Array(DAILY_MAIL_CAP - 1).fill(hashRecipient('fan@example.com'))
            expect((await run(fakeStore({ sent: same }))).ok).toBe(true)
        })
        it(`새로운 분은 하루 ${DAILY_NEW_RECIPIENT_CAP}명까지. 6번째 새 주소는 막는다`, async () => {
            const five = ['a', 'b', 'c', 'd', 'e'].map(x => hashRecipient(`${x}@x.com`))
            const r = await run(fakeStore({ sent: five }), { to: 'new@x.com' })
            expect(r.ok).toBe(false)
            if (!r.ok) {
                expect(r.status).toBe(429)
                expect(r.error).toContain(`${DAILY_NEW_RECIPIENT_CAP}명`)
            }
        })
        it('오늘 이미 보낸 분께는 5명이 차도 더 보낼 수 있다', async () => {
            const five = ['a', 'b', 'c', 'd', 'e'].map(x => hashRecipient(`${x}@x.com`))
            expect((await run(fakeStore({ sent: five }), { to: 'C@x.com' })).ok).toBe(true)
        })
        it('지문 칸이 아직 없으면(마이그레이션 전) 보낸 한 통을 새 사람 한 명으로 친다', async () => {
            const r = await run(fakeStore({ sent: DAILY_NEW_RECIPIENT_CAP }), { to: 'a@x.com' })
            expect(r.ok).toBe(false)
            if (!r.ok) expect(r.status).toBe(429)
            expect((await run(fakeStore({ sent: DAILY_NEW_RECIPIENT_CAP - 1 }))).ok).toBe(true)
        })
        it('지문이 비어 있는 옛 줄도 각각 새 사람으로 친다', async () => {
            const r = await run(fakeStore({ sent: [null, null, null, null, null] }), { to: 'a@x.com' })
            expect(r.ok).toBe(false)
        })
        it('기록을 못 읽으면 보내지 않는다(닫힌 쪽으로 실패)', async () => {
            const store = fakeStore()
            store.countSentToday = vi.fn(async () => { throw new Error('db down') })
            const r = await run(store)
            expect(r.ok).toBe(false)
            if (!r.ok) expect(r.status).toBe(503)
        })
        it('서울 오늘 0시부터 센다', async () => {
            const store = fakeStore()
            await run(store)
            expect(store.countSentToday).toHaveBeenCalledWith('u1', '2026-10-01T15:00:00.000Z')
        })
    })

    describe('수신 거부·반송 명단', () => {
        it('반송·스팸신고로 막힌 주소면 보내지 않는다', async () => {
            const r = await run(fakeStore({ suppressed: ['fan@example.com'] }), { to: 'Fan@Example.com' })
            expect(r.ok).toBe(false)
            if (!r.ok) {
                expect(r.status).toBe(403)
                expect(r.error).toContain('되돌아왔거나')
            }
        })
        it('명단 확인에 실패하면 보내지 않는다(닫힌 쪽으로 실패)', async () => {
            const r = await run(fakeStore({ suppressionError: true }))
            expect(r.ok).toBe(false)
            if (!r.ok) expect(r.status).toBe(503)
        })
    })

    it('안내 문구에 줄표(—)가 없다', async () => {
        const cases = [
            await run(fakeStore(), {}, { OS_OUTBOUND_MAIL_ENABLED: '0' }),
            await run(fakeStore(), { to: 'a@x.com,b@x.com' }),
            await run(fakeStore(), { subject: '(광고)' }),
            await run(fakeStore({ sent: DAILY_MAIL_CAP })),
            await run(fakeStore({ suppressed: ['fan@example.com'] })),
        ]
        for (const c of cases) if (!c.ok) expect(c.error).not.toMatch(/[—–]/)
    })
})
