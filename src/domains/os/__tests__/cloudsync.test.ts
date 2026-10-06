// 드라이브・노션 동기화(갈래 G)의 순수 판정 함수들 — 인터넷・DB 없이 확인한다.
import { describe, it, expect, vi } from 'vitest'
import { isChangedSince, cleanCloudProvider, handOffToProcess, nextDriveCursor } from '../cloudsync'

describe('isChangedSince — 수정시각 비교(새 것만 판정)', () => {
    it('커서(마지막 동기화 시각)가 없으면 처음이라 항상 바뀐 것으로 본다', () => {
        expect(isChangedSince('2026-09-01T00:00:00Z', null)).toBe(true)
        expect(isChangedSince(null, null)).toBe(true)
    })

    it('수정시각이 커서보다 뒤(더 최근)면 바뀐 것', () => {
        expect(isChangedSince('2026-09-10T00:00:00Z', '2026-09-01T00:00:00Z')).toBe(true)
    })

    it('수정시각이 커서와 같거나 이전이면 안 바뀐 것', () => {
        expect(isChangedSince('2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')).toBe(false)
        expect(isChangedSince('2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z')).toBe(false)
    })

    it('시각이 없거나 모양이 이상하면 안전하게 「바뀌었다」로 본다(놓치는 것보다 중복이 낫다)', () => {
        expect(isChangedSince(undefined, '2026-09-01T00:00:00Z')).toBe(true)
        expect(isChangedSince('이상한 값', '2026-09-01T00:00:00Z')).toBe(true)
        expect(isChangedSince('2026-09-10T00:00:00Z', '이상한 커서')).toBe(true)
    })
})

describe('cleanCloudProvider', () => {
    it('구글 드라이브, 노션만 받는다', () => {
        expect(cleanCloudProvider('google_drive')).toBe('google_drive')
        expect(cleanCloudProvider('notion')).toBe('notion')
    })
    it('그 밖엔 전부 null(다른 공급자 이름을 적어 보내도 안 통한다)', () => {
        expect(cleanCloudProvider('slack')).toBeNull()
        expect(cleanCloudProvider('')).toBeNull()
        expect(cleanCloudProvider(undefined)).toBeNull()
        expect(cleanCloudProvider(123)).toBeNull()
    })
})

describe('handOffToProcess — 학습 창구에 맡기기(기다리지 않기 + 내부 열쇠)', () => {
    const body = { sourceId: 's1', mentorId: 'm1', actorUserId: 'u1' }

    it('내부 열쇠 머리글과 주인 번호를 같이 보낸다', async () => {
        const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }))
        const r = await handOffToProcess('https://x.test', body, { fetch: f as unknown as typeof fetch, secret: 'k' })
        expect(r).toEqual({ queued: true })
        const [url, init] = f.mock.calls[0]
        expect(url).toBe('https://x.test/api/creator/knowledge/process')
        expect((init!.headers as Record<string, string>)['x-internal-key']).toBe('k')
        expect(JSON.parse(String(init!.body))).toEqual(body)
        expect(init!.signal).toBeInstanceOf(AbortSignal)
    })

    it('정해진 시간 안에 답이 없으면 맡긴 것으로 친다(학습은 그쪽에서 계속)', async () => {
        const f = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
            init!.signal!.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })))
        }))
        const r = await handOffToProcess('https://x.test', body, { fetch: f as unknown as typeof fetch, secret: 'k', waitMs: 20 })
        expect(r).toEqual({ queued: true })
    })

    it('401·403 처럼 바로 거절되면 실패로 센다', async () => {
        const f = vi.fn(async () => new Response('{}', { status: 401 }))
        expect(await handOffToProcess('https://x.test', body, { fetch: f as unknown as typeof fetch, secret: 'k' })).toEqual({ queued: false, status: 401 })
    })

    it('서버 열쇠가 없으면 부르지도 않는다', async () => {
        const f = vi.fn()
        const r = await handOffToProcess('https://x.test', body, { fetch: f as unknown as typeof fetch, secret: '' })
        expect(r.queued).toBe(false)
        expect(f).not.toHaveBeenCalled()
    })
})

describe('nextDriveCursor — 중간에 멈추면 커서를 마지막으로 맡긴 파일까지만', () => {
    const now = '2026-10-06T00:00:00.000Z'
    it('다 맡겼으면 지금 시각', () => {
        expect(nextDriveCursor({ prevCursor: null, done: true, lastHandledModified: '2026-10-01T00:00:00Z', nowIso: now })).toBe(now)
    })
    it('마감·칸 부족으로 멈췄으면 마지막으로 맡긴 파일의 수정시각', () => {
        expect(nextDriveCursor({ prevCursor: '2026-09-01T00:00:00Z', done: false, lastHandledModified: '2026-10-01T00:00:00Z', nowIso: now })).toBe('2026-10-01T00:00:00Z')
    })
    it('하나도 못 맡겼으면 커서를 그대로 둔다(놓치지 않는다)', () => {
        expect(nextDriveCursor({ prevCursor: '2026-09-01T00:00:00Z', done: false, lastHandledModified: null, nowIso: now })).toBe('2026-09-01T00:00:00Z')
    })
})
