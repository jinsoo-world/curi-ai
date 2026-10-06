import { describe, it, expect, vi } from 'vitest'
import { checkRateLimit, windowStart } from '../rate-limit'

/** rate_limits 표 흉내. 표가 없으면 42P01 을 돌려준다. rpc = bump_rate_limit 함수 (기본은 아직 없는 함수) */
function fakeDb(opts: { missing?: boolean; rows?: Record<string, number>; rpc?: 'ok' | 'none' | 'broken' } = {}) {
    const rows = opts.rows ?? {}
    const calls = { rpc: 0, select: 0 }
    const db = {
        async rpc(name: string, args: { p_key: string; p_ws: string }) {
            expect(name).toBe('bump_rate_limit')
            calls.rpc++
            const mode = opts.rpc ?? 'none'
            if (mode === 'none') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.bump_rate_limit' } }
            if (mode === 'broken') return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
            // 진짜 함수처럼 한 번에 올리고 올린 값을 돌려준다 (await 사이에 끼어들 틈이 없다)
            const k = `${args.p_key}|${args.p_ws}`
            rows[k] = (rows[k] ?? 0) + 1
            return { data: rows[k], error: null }
        },
        from(table: string) {
            expect(table).toBe('rate_limits')
            const q = { key: '', ws: '' }
            const builder = {
                select() { calls.select++; return builder },
                eq(col: string, v: string) { if (col === 'key') q.key = v; if (col === 'window_start') q.ws = v; return builder },
                async maybeSingle() {
                    if (opts.missing) return { data: null, error: { code: '42P01', message: 'relation missing' } }
                    const c = rows[`${q.key}|${q.ws}`]
                    return { data: c === undefined ? null : { count: c }, error: null }
                },
                async upsert(row: { key: string; window_start: string; count: number }) {
                    if (opts.missing) return { error: { code: '42P01', message: 'relation missing' } }
                    rows[`${row.key}|${row.window_start}`] = row.count
                    return { error: null }
                },
            }
            return builder
        },
    }
    return { db: db as never, rows, calls }
}

describe('lib/rate-limit — 요청 횟수 제한 (보안 C-1 9번)', () => {
    it('창 시작은 windowSec 단위로 내림한 시각이다', () => {
        const t = Date.UTC(2026, 8, 23, 10, 0, 42)
        expect(windowStart(t, 60)).toBe('2026-09-23T10:00:00.000Z')
        expect(windowStart(Date.UTC(2026, 8, 23, 10, 37, 0), 3600)).toBe('2026-09-23T10:00:00.000Z')
    })

    it('한도 안이면 통과하고 남은 횟수를 돌려준다', async () => {
        const { db } = fakeDb()
        const r1 = await checkRateLimit(db, 'chat:u1', 3, 60)
        const r2 = await checkRateLimit(db, 'chat:u1', 3, 60)
        expect(r1).toEqual({ allowed: true, remaining: 2 })
        expect(r2).toEqual({ allowed: true, remaining: 1 })
    })

    it('한도를 채우면 막는다', async () => {
        const { db } = fakeDb()
        await checkRateLimit(db, 'k', 2, 60)
        await checkRateLimit(db, 'k', 2, 60)
        const r = await checkRateLimit(db, 'k', 2, 60)
        expect(r).toEqual({ allowed: false, remaining: 0 })
    })

    it('열쇠가 다르면 따로 센다', async () => {
        const { db } = fakeDb()
        await checkRateLimit(db, 'a', 1, 60)
        expect((await checkRateLimit(db, 'b', 1, 60)).allowed).toBe(true)
        expect((await checkRateLimit(db, 'a', 1, 60)).allowed).toBe(false)
    })

    it('표가 없으면 막지 않고 경고만 남긴다', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { db } = fakeDb({ missing: true })
        const r = await checkRateLimit(db, 'k', 1, 60)
        expect(r.allowed).toBe(true)
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })

    it('DB 함수 bump_rate_limit 가 있으면 그걸로 한 번에 센다 (옛 읽고 쓰기는 안 한다)', async () => {
        const { db, calls } = fakeDb({ rpc: 'ok' })
        expect(await checkRateLimit(db, 'k', 2, 60)).toEqual({ allowed: true, remaining: 1 })
        expect(await checkRateLimit(db, 'k', 2, 60)).toEqual({ allowed: true, remaining: 0 })
        expect(await checkRateLimit(db, 'k', 2, 60)).toEqual({ allowed: false, remaining: 0 })
        expect(calls.rpc).toBe(3)
        expect(calls.select).toBe(0)
    })

    it('동시에 몰려도 한도만큼만 통과한다 (DB 함수가 있을 때)', async () => {
        const { db } = fakeDb({ rpc: 'ok' })
        const rs = await Promise.all(Array.from({ length: 10 }, () => checkRateLimit(db, 'burst', 3, 60)))
        expect(rs.filter(r => r.allowed)).toHaveLength(3)
    })

    it('함수가 아직 없으면(배포가 마이그레이션보다 먼저) 옛 방식으로 센다', async () => {
        const { db, calls } = fakeDb({ rpc: 'none' })
        expect(await checkRateLimit(db, 'k', 1, 60)).toEqual({ allowed: true, remaining: 0 })
        expect(await checkRateLimit(db, 'k', 1, 60)).toEqual({ allowed: false, remaining: 0 })
        expect(calls.select).toBe(2)
    })

    it('함수 오류(없음 말고 다른 고장)는 기본은 통과, failClosed 면 막는다', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect((await checkRateLimit(fakeDb({ rpc: 'broken' }).db, 'k', 5, 60)).allowed).toBe(true)
        expect(await checkRateLimit(fakeDb({ rpc: 'broken' }).db, 'k', 5, 60, { failClosed: true })).toEqual({ allowed: false, remaining: 0 })
        warn.mockRestore()
    })

    it('표가 없을 때도 failClosed 면 막는다 (기본은 지금처럼 통과)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect((await checkRateLimit(fakeDb({ missing: true }).db, 'k', 1, 60)).allowed).toBe(true)
        expect((await checkRateLimit(fakeDb({ missing: true }).db, 'k', 1, 60, { failClosed: true })).allowed).toBe(false)
        warn.mockRestore()
    })
})
