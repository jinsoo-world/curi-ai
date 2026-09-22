import { describe, it, expect, vi } from 'vitest'
import { checkRateLimit, windowStart } from '../rate-limit'

/** rate_limits 표 흉내. 표가 없으면 42P01 을 돌려준다 */
function fakeDb(opts: { missing?: boolean; rows?: Record<string, number> } = {}) {
    const rows = opts.rows ?? {}
    const db = {
        from(table: string) {
            expect(table).toBe('rate_limits')
            const q = { key: '', ws: '' }
            const builder = {
                select() { return builder },
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
    return { db: db as never, rows }
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
})
