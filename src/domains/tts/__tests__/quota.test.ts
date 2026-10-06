import { describe, it, expect } from 'vitest'
import { chargeDailyChars, TTS_DAILY_CHARS } from '../quota'

// DB 함수 tts_charge_chars 의 동작(상한 안에서만 더하고 true)을 흉내 낸 가짜 DB
function fakeDb() {
    const store = new Map<string, number>()
    const calls: Record<string, unknown>[] = []
    return {
        calls,
        rpc: async (fn: string, a: { p_key: string; p_chars: number; p_limit: number }) => {
            calls.push({ fn, ...a })
            const used = store.get(a.p_key) ?? 0
            if (used + a.p_chars > a.p_limit) return { data: false, error: null }
            store.set(a.p_key, used + a.p_chars)
            return { data: true, error: null }
        },
    }
}

describe('하루 글자 수 상한(DB 함수 한 번 호출)', () => {
    it('상한까지는 통과, 넘으면 막는다', async () => {
        const db = fakeDb()
        expect((await chargeDailyChars(db as never, 'u', 15000)).allowed).toBe(true)
        expect((await chargeDailyChars(db as never, 'u', 5000)).allowed).toBe(true)
        expect((await chargeDailyChars(db as never, 'u', 1)).allowed).toBe(false)
        expect(TTS_DAILY_CHARS).toBe(20000)
        expect(db.calls[0]).toMatchObject({ fn: 'tts_charge_chars', p_key: 'tts-day:u:u', p_limit: 20000 })
    })
    it('DB 함수가 없거나 아프면 막지 않는다', async () => {
        const bad = { rpc: async () => ({ data: null, error: { code: '42883' } }) }
        expect((await chargeDailyChars(bad as never, 'u', 100)).allowed).toBe(true)
        const thrown = { rpc: async () => { throw new Error('boom') } }
        expect((await chargeDailyChars(thrown as never, 'u', 100)).allowed).toBe(true)
    })
})
