import { describe, it, expect } from 'vitest'
import { chargeDailyChars, TTS_DAILY_CHARS } from '../quota'

function fakeDb() {
    const store = new Map<string, number>()
    let key = ''
    const q: Record<string, unknown> = {}
    Object.assign(q, {
        select: () => q,
        eq: (c: string, v: string) => { if (c === 'key') key = v; return q },
        maybeSingle: async () => ({ data: store.has(key) ? { count: store.get(key) } : null, error: null }),
        upsert: async (row: { key: string; count: number }) => { store.set(row.key, row.count); return { error: null } },
    })
    return { from: () => q } as never
}

describe('하루 글자 수 상한', () => {
    it('상한까지는 통과, 넘으면 막는다', async () => {
        const db = fakeDb()
        expect((await chargeDailyChars(db, 'u', 15000)).allowed).toBe(true)
        expect((await chargeDailyChars(db, 'u', 5000)).allowed).toBe(true)
        expect((await chargeDailyChars(db, 'u', 1)).allowed).toBe(false)
        expect(TTS_DAILY_CHARS).toBe(20000)
    })
    it('표가 아프면 막지 않는다', async () => {
        const bad = { from: () => { throw new Error('boom') } } as never
        expect((await chargeDailyChars(bad, 'u', 100)).allowed).toBe(true)
    })
})
