// 봇이 남에게 보내는 메일 잠금 (1002 설계 8번). 큐리어스와 같은 SES 계정을 쓰니 한 사람의 남용이 회사 평판을 깬다.
import { describe, it, expect, vi } from 'vitest'
import {
    guardOutboundEmail, hashRecipient, kstDayStart, suppressionCandidates, visibleText, mailKillSwitchOff,
    DAILY_MAIL_CAP, DAILY_NEW_RECIPIENT_CAP,
} from '../outbound-guard'
import type { OutboundGuardStore, SentRow } from '../outbound-guard'

const NOW = () => new Date('2026-10-02T05:00:00Z')   // 서울 14:00
const OWN = 'res-own'

/** sent = 오늘 이미 남에게 보낸(또는 보내는 중인) 기록들의 받는 주소 지문. null = 지문 모름 */
function fakeStore(opts: { sent?: (string | null)[]; suppressed?: string[]; suppressionError?: boolean; reserveFails?: boolean } = {}) {
    const rows: SentRow[] = (opts.sent ?? []).map((h, i) => ({ id: `r${i}`, toHash: h }))
    const store = {
        listSentToday: vi.fn(async (): Promise<SentRow[]> => rows),
        reserve: vi.fn(async (): Promise<string | null> => {
            if (opts.reserveFails) return null
            rows.push({ id: OWN, toHash: null })   // 자기 예약 줄도 목록에 보인다(실제 DB 처럼)
            return OWN
        }),
        release: vi.fn(async () => {}),
        isSuppressed: vi.fn(async (email: string) => {
            if (opts.suppressionError) throw new Error('AccessDenied')
            return (opts.suppressed ?? []).includes(email)
        }),
    } satisfies OutboundGuardStore
    return store
}

const input = (extra: Record<string, unknown> = {}) => ({ userId: 'u1', permissionRequestId: 'card-1', to: 'fan@example.com', subject: '수업 자료 보내드려요', body: '어제 말씀하신 자료예요.', ...extra })
const run = (store: OutboundGuardStore, extra: Record<string, unknown> = {}, env: Record<string, string | undefined> = {}) =>
    guardOutboundEmail(input(extra), { store, now: NOW, env })

describe('outbound-guard — 남에게 가는 메일 잠금', () => {
    it('평범한 1:1 안내 메일은 통과하고, 지문과 예약 id 를 돌려준다', async () => {
        const store = fakeStore()
        const r = await run(store)
        expect(r).toEqual({ ok: true, toHash: hashRecipient('fan@example.com'), reservationId: OWN })
        expect(store.reserve).toHaveBeenCalledWith({ userId: 'u1', permissionRequestId: 'card-1', toHash: hashRecipient('fan@example.com'), toHint: '.com' })
        expect(store.release).not.toHaveBeenCalled()
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
        it.each(['0', 'false', 'off', ' OFF ', 'False'])("'%s' 이면 막는다. DB 도 안 본다", async (v) => {
            const store = fakeStore()
            const r = await run(store, {}, { OS_OUTBOUND_MAIL_ENABLED: v })
            expect(r.ok).toBe(false)
            if (!r.ok) {
                expect(r.status).toBe(503)
                expect(r.error).toContain('잠시 멈춰')
            }
            expect(store.reserve).not.toHaveBeenCalled()
            expect(store.listSentToday).not.toHaveBeenCalled()
        })
        it.each([undefined, '', '1', 'true', 'on'])('값이 %s 이면 지금처럼 켜져 있다', async (v) => {
            expect(mailKillSwitchOff(v)).toBe(false)
            expect((await run(fakeStore(), {}, { OS_OUTBOUND_MAIL_ENABLED: v })).ok).toBe(true)
        })
    })

    describe('한 번에 한 분에게만', () => {
        it.each([
            ['쉼표', 'a@x.com,b@x.com'],
            ['세미콜론', 'a@x.com; b@x.com'],
            ['빈칸', 'a@x.com b@x.com'],
            ['배열 두 개', ['a@x.com', 'b@x.com']],
        ])('%s 로 여러 명을 넣으면 막는다', async (_n, to) => {
            const store = fakeStore()
            const r = await run(store, { to })
            expect(r.ok).toBe(false)
            if (!r.ok) {
                expect(r.status).toBe(400)
                expect(r.error).toBe('메일은 한 번에 한 분에게만 보낼 수 있어요.')
            }
            expect(store.reserve).not.toHaveBeenCalled()
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
            ['제목 (AD)', { subject: '(AD) fall sale' }],
            ['제목 [ad]', { subject: '[ad] fall sale' }],
            ['본문 advertisement', { body: 'This is an Advertisement' }],
            ['본문 수신거부', { body: '원치 않으시면 수신거부 해 주세요' }],
            ['본문 수신 거부', { body: '수신 거부: 080-000-0000' }],
            ['html unsubscribe', { html: '<a href="x">Unsubscribe</a>' }],
            ['본문 opt-out', { body: 'reply STOP to opt-out' }],
            ['태그로 쪼갠 수신<b>거부</b>', { html: '수신<b>거부</b>' }],
            ['엔티티로 감춘 &#xAD11;&#xACE0;', { html: '(&#xAD11;&#xACE0;) 특가' }],
            ['엔티티로 감춘 &#40;광고&#41;', { html: '&#40;광고&#41; 특가' }],
            ['&lt;태그&gt;로 쪼갠 unsub', { html: 'un<span>sub</span>scribe' }],
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
        it('평범한 낱말 속 ad(예: read, address)는 막지 않는다', async () => {
            expect((await run(fakeStore(), { body: 'Please read the address below. Ad hoc meeting.' })).ok).toBe(true)
        })
        it('visibleText 는 태그를 빼고 엔티티를 풀어 읽는다', () => {
            expect(visibleText('<p>A&amp;B&nbsp;&lt;c&gt; &#54620;&#xAE00;</p>')).toBe('A&B <c> 한글')
        })
    })

    describe('하루 상한 (서울 기준)', () => {
        it(`오늘 ${DAILY_MAIL_CAP}통을 이미 보냈으면 막고, 잡아 둔 예약을 푼다`, async () => {
            const store = fakeStore({ sent: Array(DAILY_MAIL_CAP).fill(hashRecipient('fan@example.com')) })
            const r = await run(store)
            expect(r.ok).toBe(false)
            if (!r.ok) {
                expect(r.status).toBe(429)
                expect(r.error).toContain(`${DAILY_MAIL_CAP}통`)
            }
            expect(store.release).toHaveBeenCalledWith(OWN)
        })
        it(`${DAILY_MAIL_CAP - 1}통까지는 보낼 수 있다(자기 예약 줄은 세지 않는다)`, async () => {
            const store = fakeStore({ sent: Array(DAILY_MAIL_CAP - 1).fill(hashRecipient('fan@example.com')) })
            expect((await run(store)).ok).toBe(true)
        })
        it('동시에 들어온 다른 요청의 보내는 중 줄도 센다(둘 다 넘치지 않는다)', async () => {
            // 19통 보냄 + 다른 요청이 막 예약한 줄 1개 = 20 → 이번 것은 막힌다
            const sent = [...Array(DAILY_MAIL_CAP - 1).fill(hashRecipient('fan@example.com')), hashRecipient('fan@example.com')]
            const r = await run(fakeStore({ sent }))
            expect(r.ok).toBe(false)
        })
        it(`새로운 분은 하루 ${DAILY_NEW_RECIPIENT_CAP}명까지. 6번째 새 주소는 막는다`, async () => {
            const five = ['a', 'b', 'c', 'd', 'e'].map(x => hashRecipient(`${x}@x.com`))
            const store = fakeStore({ sent: five })
            const r = await run(store, { to: 'new@x.com' })
            expect(r.ok).toBe(false)
            if (!r.ok) {
                expect(r.status).toBe(429)
                expect(r.error).toContain(`${DAILY_NEW_RECIPIENT_CAP}명`)
            }
            expect(store.release).toHaveBeenCalledWith(OWN)
        })
        it('오늘 이미 보낸 분께는 5명이 차도 더 보낼 수 있다', async () => {
            const five = ['a', 'b', 'c', 'd', 'e'].map(x => hashRecipient(`${x}@x.com`))
            expect((await run(fakeStore({ sent: five }), { to: 'C@x.com' })).ok).toBe(true)
        })
        it('지문을 모르는 줄(마이그레이션 전·옛 줄)은 각각 새 사람으로 친다', async () => {
            expect((await run(fakeStore({ sent: [null, null, null, null, null] }), { to: 'a@x.com' })).ok).toBe(false)
            expect((await run(fakeStore({ sent: [null, null, null, null] }), { to: 'a@x.com' })).ok).toBe(true)
        })
        it('예약 줄을 못 만들어도(마이그레이션 전) 상한은 그대로 센다', async () => {
            const store = fakeStore({ reserveFails: true, sent: Array(DAILY_MAIL_CAP).fill(hashRecipient('fan@example.com')) })
            expect((await run(store)).ok).toBe(false)
            const ok = await run(fakeStore({ reserveFails: true }))
            expect(ok).toEqual({ ok: true, toHash: hashRecipient('fan@example.com'), reservationId: null })
        })
        it('기록을 못 읽으면 보내지 않고(닫힌 쪽으로 실패) 예약을 푼다', async () => {
            const store = fakeStore()
            store.listSentToday = vi.fn(async () => { throw new Error('db down') })
            const r = await run(store)
            expect(r.ok).toBe(false)
            if (!r.ok) expect(r.status).toBe(503)
            expect(store.release).toHaveBeenCalledWith(OWN)
        })
        it('서울 오늘 0시부터 센다', async () => {
            const store = fakeStore()
            await run(store)
            expect(store.listSentToday).toHaveBeenCalledWith('u1', '2026-10-01T15:00:00.000Z')
        })
    })

    describe('수신 거부·반송 명단', () => {
        it('반송·스팸신고로 막힌 주소면 보내지 않고 예약을 푼다', async () => {
            const store = fakeStore({ suppressed: ['fan@example.com'] })
            const r = await run(store, { to: 'Fan@Example.com' })
            expect(r.ok).toBe(false)
            if (!r.ok) {
                expect(r.status).toBe(403)
                expect(r.error).toContain('되돌아왔거나')
            }
            expect(store.release).toHaveBeenCalledWith(OWN)
        })
        it('+꼬리표를 뗀 주소가 명단에 있어도 막는다', async () => {
            const r = await run(fakeStore({ suppressed: ['fan@example.com'] }), { to: 'fan+promo@example.com' })
            expect(r.ok).toBe(false)
            if (!r.ok) expect(r.status).toBe(403)
        })
        it('대소문자 원래 모양으로 명단에 있어도 막는다', async () => {
            const r = await run(fakeStore({ suppressed: ['Fan@Example.com'] }), { to: 'Fan@Example.com' })
            expect(r.ok).toBe(false)
        })
        it('확인할 주소 목록: 소문자 · 원래 모양 · +꼬리표 뗀 것 (겹치면 한 번)', () => {
            expect(suppressionCandidates('Fan+Tag@Example.com')).toEqual(['fan+tag@example.com', 'Fan+Tag@Example.com', 'fan@example.com'])
            expect(suppressionCandidates('fan@example.com')).toEqual(['fan@example.com'])
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
            await run(fakeStore({ sent: Array(DAILY_MAIL_CAP).fill(null) })),
            await run(fakeStore({ suppressed: ['fan@example.com'] })),
        ]
        for (const c of cases) if (!c.ok) expect(c.error).not.toMatch(/[—–]/)
    })
})
