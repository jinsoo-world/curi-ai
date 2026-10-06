// PATCH /api/mentors/{id} — 목소리 칸 고치기는 봇 주인만, 관리자 열쇠로 (회원 열쇠로 mentors 를 못 고친다)
import { describe, it, expect, vi, beforeEach } from 'vitest'

const OWNER = '11111111-1111-4111-8111-111111111111'
const STRANGER = '22222222-2222-4222-8222-222222222222'
const BOT = '9fc9b3fa-1721-40c6-bc4e-1b544c117483'

const state: { user: { id: string } | null } = { user: null }
const updates: { payload: unknown; filters: [string, unknown][] }[] = []

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: state.user } }) },
        from: () => { throw new Error('회원 열쇠로 mentors 를 건드렸다') },
    }),
}))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        from: () => {
            const rec = { payload: undefined as unknown, filters: [] as [string, unknown][] }
            const q: Record<string, unknown> = {}
            Object.assign(q, {
                select: () => q,
                update: (p: unknown) => { rec.payload = p; updates.push(rec); return q },
                eq: (k: string, v: unknown) => { rec.filters.push([k, v]); return q },
                single: async () => ({ data: { voice_id: null }, error: null }),
                then: (r: (v: unknown) => void) => r({ error: null }),
            })
            return q
        },
    }),
}))
vi.mock('@/domains/os/knowledge', () => {
    class BotNotMine extends Error {}
    return { BotNotMine, assertBotOwned: async (_db: unknown, userId: string) => { if (userId !== OWNER) throw new BotNotMine() } }
})

import { PATCH } from '../route'

const call = (body: unknown) => PATCH(
    new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ mentorId: BOT }) },
)

beforeEach(() => { updates.length = 0; state.user = null })

describe('PATCH /api/mentors/{id}', () => {
    it('손님은 401', async () => {
        expect((await call({ voice_test_url: 'https://x/t.mp3' })).status).toBe(401)
    })
    it('남의 봇은 403, 아무것도 안 바뀐다', async () => {
        state.user = { id: STRANGER }
        expect((await call({ voice_test_url: 'https://x/t.mp3' })).status).toBe(403)
        expect(updates).toHaveLength(0)
    })
    it('주인은 관리자 열쇠로 고친다', async () => {
        state.user = { id: OWNER }
        expect((await call({ voice_test_url: 'https://x/t.mp3' })).status).toBe(200)
        expect(updates[0]).toEqual({ payload: { voice_test_url: 'https://x/t.mp3' }, filters: [['id', BOT]] })
    })
    it('목소리 지우기(null)는 되고, 다른 목소리 id 붙이기는 400', async () => {
        state.user = { id: OWNER }
        expect((await call({ voice_id: null, voice_sample_url: null })).status).toBe(200)
        updates.length = 0
        expect((await call({ voice_id: 'someone-elses-voice' })).status).toBe(400)
        expect(updates).toHaveLength(0)
    })
})
